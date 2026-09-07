import { after, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { bridge, hangup, startRecording, startTranscription } from '@/lib/telnyx/client';
import { decodeClientState } from '@/lib/telnyx/client-state';
import { parseWebhook, statusFromHangupCause, type TelnyxWebhookEvent } from '@/lib/telnyx/events';
import { verifyTelnyxSignature } from '@/lib/telnyx/signature';
import { runAnalysisForCall } from '@/lib/ai/run';

export const dynamic = 'force-dynamic';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Telnyx Call Control-webhook.
 *
 * Ruten er undtaget fra auth-middleware'en og autentificeres i stedet med
 * Ed25519-signaturen. Alle svar er 200, også ved fejl vi selv har skabt:
 * Telnyx prøver ellers igen og igen, og en hændelse vi ikke kan bruge bliver
 * ikke bedre af at blive gentaget. Det der går galt, logges.
 */
export async function POST(request: Request) {
  // Signaturen dækker den rå body, så den skal læses som tekst først.
  const body = await request.text();

  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[telnyx] TELNYX_PUBLIC_KEY mangler - webhooken kan ikke verificeres');
    return NextResponse.json({ error: 'ikke konfigureret' }, { status: 500 });
  }

  const result = verifyTelnyxSignature({
    publicKey,
    signature: request.headers.get('telnyx-signature-ed25519'),
    timestamp: request.headers.get('telnyx-timestamp'),
    body,
  });

  if (!result.valid) {
    console.warn(`[telnyx] afviste webhook: ${result.reason}`);
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const event = parseWebhook(body);
  if (!event) {
    return NextResponse.json({ error: 'ulæselig payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    await handleEvent(supabase, event);
  } catch (error) {
    console.error('[telnyx] fejl under behandling af', event.data.event_type, error);
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(supabase: Admin, event: TelnyxWebhookEvent) {
  const { event_type: type, payload, id: eventId } = event.data;
  const state = decodeClientState(payload.client_state);

  // Find opkaldet enten via client_state eller via Telnyx' eget id.
  let callId = state?.callId ?? null;
  if (!callId && payload.call_control_id) {
    const { data } = await supabase
      .from('calls')
      .select('id')
      .eq('telnyx_call_control_id', payload.call_control_id)
      .maybeSingle();
    callId = data?.id ?? null;
  }

  // Gem hændelsen råt. Det unikke indeks på telnyx_event_id gør at en
  // gentaget levering ikke tælles med to gange.
  if (eventId) {
    const { error } = await supabase.from('call_events').insert({
      org_id: state?.orgId ?? null,
      call_id: callId,
      event_type: type,
      telnyx_event_id: eventId,
      payload: JSON.parse(JSON.stringify(event.data)),
    });

    // 23505 = allerede set. Så er hændelsen behandlet, og vi stopper her.
    if (error?.code === '23505') return;
  }

  if (!callId) {
    console.warn(`[telnyx] ${type} kunne ikke kobles til et opkald`);
    return;
  }

  switch (type) {
    case 'call.initiated':
      await supabase
        .from('calls')
        .update({
          status: 'initiated',
          telnyx_call_control_id: payload.call_control_id,
          telnyx_call_session_id: payload.call_session_id,
          telnyx_call_leg_id: payload.call_leg_id,
        })
        .eq('id', callId);
      break;

    case 'call.ringing':
      await supabase.from('calls').update({ status: 'ringing' }).eq('id', callId);
      break;

    case 'call.answered':
      await onAnswered(supabase, callId, payload.call_control_id, state?.sessionId);
      break;

    case 'call.machine.detection.ended':
    case 'call.machine.premium.detection.ended':
      await onMachineDetected(supabase, callId, payload.result, payload.call_control_id);
      break;

    case 'call.hangup':
      await onHangup(supabase, callId, payload.hangup_cause);
      scheduleAnalysis(callId);
      break;

    case 'call.recording.saved':
      await onRecordingSaved(supabase, callId, event);
      break;

    case 'call.transcription':
      await onTranscription(supabase, callId, event);
      break;

    case 'call.transcription.saved':
      // Udskriften er komplet, så nu kan opkaldet vurderes. Analysen kører
      // efter svaret er sendt, så Telnyx ikke venter på modellen.
      scheduleAnalysis(callId);
      break;

    default:
      // Alle øvrige hændelser ligger gemt i call_events hvis de får brug for os.
      break;
  }
}

/**
 * Sætter AI-analysen i gang efter at webhook-svaret er sendt.
 *
 * after() lader Next køre arbejdet færdigt uden at Telnyx venter - en
 * langsom modelkald ville ellers give timeout og udløse gentagne leveringer.
 * runAnalysisForCall springer selv over, hvis udskriften mangler eller
 * opkaldet allerede er analyseret.
 */
function scheduleAnalysis(callId: string) {
  after(async () => {
    const result = await runAnalysisForCall(callId);
    if (result.status === 'error') {
      console.error('[ai] analysen fejlede for opkald', callId, result.message);
    }
  });
}

async function onAnswered(
  supabase: Admin,
  callId: string,
  callControlId: string | undefined,
  sessionId: string | undefined,
) {
  const answeredAt = new Date().toISOString();

  await supabase
    .from('calls')
    .update({ status: 'answered', answered_at: answeredAt })
    .eq('id', callId);

  if (!callControlId) return;

  // Optag og transskribér fra det øjeblik der er nogen i røret.
  await Promise.allSettled([
    startRecording(callControlId),
    startTranscription(callControlId),
  ]);

  if (!sessionId) return;

  const { data: session } = await supabase
    .from('dialer_sessions')
    .select('id, mode, agent_call_control_id')
    .eq('id', sessionId)
    .single();

  if (!session) return;

  await supabase
    .from('dialer_sessions')
    .select('calls_connected')
    .eq('id', sessionId)
    .single()
    .then(({ data }) => {
      if (!data) return;
      return supabase
        .from('dialer_sessions')
        .update({ calls_connected: data.calls_connected + 1 })
        .eq('id', sessionId);
    });

  if (session.mode !== 'parallel' || !session.agent_call_control_id) return;

  // Første lead der svarer får agenten. De øvrige linjer lægges på med det
  // samme, så ingen sidder og lytter til stilhed.
  const { data: siblings } = await supabase
    .from('calls')
    .select('id, telnyx_call_control_id, status')
    .eq('session_id', sessionId)
    .eq('is_agent_leg', false)
    .neq('id', callId)
    .in('status', ['queued', 'initiated', 'ringing']);

  await bridge(session.agent_call_control_id, callControlId);

  await Promise.allSettled(
    (siblings ?? [])
      .filter((sibling) => sibling.telnyx_call_control_id)
      .map(async (sibling) => {
        await hangup(sibling.telnyx_call_control_id!);
        await supabase
          .from('calls')
          .update({ status: 'canceled', ended_at: new Date().toISOString() })
          .eq('id', sibling.id);
      }),
  );
}

async function onMachineDetected(
  supabase: Admin,
  callId: string,
  result: string | undefined,
  callControlId: string | undefined,
) {
  // 'human' betyder at der sidder en person - så skal der ikke gøres noget.
  if (result === 'human' || !result) return;

  await supabase.from('calls').update({ status: 'voicemail' }).eq('id', callId);

  // Læg på i stedet for at brænde tid af på en telefonsvarer.
  if (callControlId) {
    await hangup(callControlId).catch(() => undefined);
  }
}

async function onHangup(supabase: Admin, callId: string, cause: string | undefined) {
  const { data: call } = await supabase
    .from('calls')
    .select('status, started_at, answered_at')
    .eq('id', callId)
    .single();

  if (!call) return;

  const endedAt = new Date();
  const started = call.started_at ? new Date(call.started_at) : null;
  const answered = call.answered_at ? new Date(call.answered_at) : null;

  // Taletid tælles først fra det øjeblik nogen svarede.
  const talkSeconds = answered
    ? Math.max(0, Math.round((endedAt.getTime() - answered.getTime()) / 1000))
    : 0;
  const durationSeconds = started
    ? Math.max(0, Math.round((endedAt.getTime() - started.getTime()) / 1000))
    : null;

  // Et opkald der blev besvaret er gennemført, uanset hvordan det sluttede.
  const status = call.status === 'answered' ? 'completed' : statusFromHangupCause(cause);

  await supabase
    .from('calls')
    .update({
      status: call.status === 'voicemail' ? 'voicemail' : status,
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      talk_seconds: talkSeconds,
      hangup_cause: cause ?? null,
    })
    .eq('id', callId);
}

async function onRecordingSaved(supabase: Admin, callId: string, event: TelnyxWebhookEvent) {
  const { payload } = event.data;
  const url =
    payload.recording_urls?.mp3 ??
    payload.public_recording_urls?.mp3 ??
    payload.recording_urls?.wav ??
    payload.public_recording_urls?.wav;

  if (!url) return;

  const { data: call } = await supabase
    .from('calls')
    .select('org_id')
    .eq('id', callId)
    .single();

  if (!call) return;

  await supabase.from('recordings').insert({
    org_id: call.org_id,
    call_id: callId,
    telnyx_recording_id: payload.recording_id ?? null,
    url,
    format: payload.recording_urls?.mp3 ? 'mp3' : 'wav',
    channels: payload.channels ?? 'dual',
  });
}

async function onTranscription(supabase: Admin, callId: string, event: TelnyxWebhookEvent) {
  const data = event.data.payload.transcription_data;
  const text = data?.transcript?.trim();

  // Kun færdige segmenter gemmes; de foreløbige overskrives alligevel.
  if (!text || data?.is_final === false) return;

  const { data: call } = await supabase.from('calls').select('org_id').eq('id', callId).single();
  if (!call) return;

  const { data: existing } = await supabase
    .from('transcripts')
    .select('id, text, segments')
    .eq('call_id', callId)
    .maybeSingle();

  // Telnyx sender transskriptionen løbende, så segmenterne lægges i forlængelse.
  const segment = {
    speaker: data?.track === 'inbound' ? 'lead' : 'agent',
    start: 0,
    end: 0,
    text,
  };

  if (existing) {
    await supabase
      .from('transcripts')
      .update({
        text: `${existing.text}\n${text}`.trim(),
        segments: [...(existing.segments ?? []), segment],
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('transcripts').insert({
      org_id: call.org_id,
      call_id: callId,
      provider: 'telnyx',
      language: 'da',
      text,
      segments: [segment],
    });
  }
}
