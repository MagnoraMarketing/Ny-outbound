import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { clampLines } from '@/lib/dialer/queue';
import { dial, TelnyxError } from '@/lib/telnyx/client';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  leadIds: z.array(z.string().uuid()).min(1).max(8),
});

/**
 * Starter en runde parallelle opkald.
 *
 * Serveren ringer selv ud på hver linje via Call Control. Når det første lead
 * tager telefonen, kobler webhooken det sammen med agentens ben og lægger de
 * øvrige linjer på - se src/app/api/telnyx/webhook/route.ts.
 */
export async function POST(request: Request) {
  const { profile, organization } = await requireSession();
  const supabase = await createClient();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ugyldig forespørgsel.' }, { status: 400 });
  }

  const { sessionId, leadIds } = parsed.data;

  const { data: session } = await supabase
    .from('dialer_sessions')
    .select('id, mode, lines, status')
    .eq('id', sessionId)
    .single();

  if (!session || session.status !== 'active') {
    return NextResponse.json({ error: 'Sessionen er ikke aktiv.' }, { status: 409 });
  }

  const from = profile.caller_id ?? organization.default_caller_id;
  if (!from) {
    return NextResponse.json(
      { error: 'Der er ikke sat et afsendernummer.' },
      { status: 409 },
    );
  }

  // Loftet håndhæves her, uanset hvad klienten beder om.
  const allowed = clampLines(session.lines);
  const targets = leadIds.slice(0, allowed);

  const { data: leads } = await supabase
    .from('leads')
    .select('id, phone, status, call_attempts')
    .in('id', targets)
    .eq('do_not_call', false)
    .not('phone', 'is', null);

  if (!leads?.length) {
    return NextResponse.json({ error: 'Ingen af de valgte leads må ringes op.' }, { status: 409 });
  }

  const started: { callId: string; leadId: string }[] = [];
  const failed: { leadId: string; error: string }[] = [];

  for (const lead of leads) {
    const { data: call, error } = await supabase
      .from('calls')
      .insert({
        org_id: profile.org_id,
        lead_id: lead.id,
        user_id: profile.id,
        session_id: sessionId,
        direction: 'outbound',
        status: 'queued',
        from_number: from,
        to_number: lead.phone,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !call) {
      failed.push({ leadId: lead.id, error: error?.message ?? 'kunne ikke oprettes' });
      continue;
    }

    try {
      const telnyxCall = await dial({
        to: lead.phone!,
        from,
        connectionId: organization.telnyx_connection_id ?? undefined,
        clientState: {
          callId: call.id,
          orgId: profile.org_id,
          sessionId,
          role: 'lead',
        },
      });

      await supabase
        .from('calls')
        .update({
          status: 'initiated',
          telnyx_call_control_id: telnyxCall.call_control_id,
          telnyx_call_session_id: telnyxCall.call_session_id,
          telnyx_call_leg_id: telnyxCall.call_leg_id,
        })
        .eq('id', call.id);

      await supabase
        .from('leads')
        .update({
          call_attempts: lead.call_attempts + 1,
          last_call_at: new Date().toISOString(),
          status: lead.status === 'new' ? 'attempting' : lead.status,
        })
        .eq('id', lead.id);

      started.push({ callId: call.id, leadId: lead.id });
    } catch (err) {
      // Markér rækken som fejlet, så den ikke bliver hængende som 'queued'.
      await supabase
        .from('calls')
        .update({
          status: 'failed',
          hangup_cause: err instanceof TelnyxError ? err.message : 'dial_failed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', call.id);

      failed.push({
        leadId: lead.id,
        error: err instanceof Error ? err.message : 'ukendt fejl',
      });
    }
  }

  if (started.length) {
    const { data: current } = await supabase
      .from('dialer_sessions')
      .select('calls_made')
      .eq('id', sessionId)
      .single();

    if (current) {
      await supabase
        .from('dialer_sessions')
        .update({ calls_made: current.calls_made + started.length })
        .eq('id', sessionId);
    }
  }

  return NextResponse.json({ started, failed });
}
