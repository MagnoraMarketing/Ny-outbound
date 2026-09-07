import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeCall, AnalysisError } from './analyze';

type Admin = ReturnType<typeof createAdminClient>;

export interface RunResult {
  status: 'ok' | 'skipped' | 'error';
  message?: string;
}

/**
 * Kører AI-analysen for et opkald og gemmer resultatet.
 *
 * Bruges både af webhooken (når opkaldet er slut) og af knappen på
 * opkaldssiden, så et opkald der fejlede kan analyseres igen bagefter.
 * Klienten er service role, fordi webhooken ikke har en indlogget bruger -
 * derfor filtreres der eksplicit på org_id hele vejen igennem.
 */
export async function runAnalysisForCall(
  callId: string,
  supabase: Admin = createAdminClient(),
): Promise<RunResult> {
  const { data: call } = await supabase
    .from('calls')
    .select('id, org_id, lead_id, user_id, talk_seconds')
    .eq('id', callId)
    .single();

  if (!call) return { status: 'error', message: 'Opkaldet blev ikke fundet.' };

  const { data: existing } = await supabase
    .from('call_ai_analysis')
    .select('id')
    .eq('call_id', callId)
    .maybeSingle();

  if (existing) return { status: 'skipped', message: 'Opkaldet er allerede analyseret.' };

  const { data: transcript } = await supabase
    .from('transcripts')
    .select('text, segments')
    .eq('call_id', callId)
    .maybeSingle();

  if (!transcript?.text) {
    return { status: 'skipped', message: 'Der er ingen udskrift af opkaldet endnu.' };
  }

  const [{ data: lead }, { data: dispositions }] = await Promise.all([
    call.lead_id
      ? supabase
          .from('leads')
          .select('company_name, contact_name')
          .eq('id', call.lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('dispositions')
      .select('code, name')
      .eq('org_id', call.org_id)
      .eq('active', true),
  ]);

  try {
    const outcome = await analyzeCall({
      companyName: lead?.company_name ?? 'Ukendt virksomhed',
      contactName: lead?.contact_name ?? null,
      transcript: transcript.text,
      segments: transcript.segments ?? [],
      talkSeconds: call.talk_seconds,
      dispositions: dispositions ?? [],
    });

    const { analysis } = outcome;

    const followUpAt =
      analysis.follow_up_in_hours > 0
        ? new Date(Date.now() + analysis.follow_up_in_hours * 3600_000).toISOString()
        : null;

    const { error } = await supabase.from('call_ai_analysis').insert({
      org_id: call.org_id,
      call_id: callId,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      outcome: analysis.outcome,
      objections: analysis.objections,
      buying_signals: analysis.buying_signals,
      next_action: analysis.next_action,
      suggested_disposition_code: analysis.suggested_disposition_code,
      suggested_follow_up_at: followUpAt,
      coaching: analysis.coaching,
      lead_score: analysis.lead_score,
      model: outcome.model,
      input_tokens: outcome.inputTokens,
      output_tokens: outcome.outputTokens,
    });

    if (error) {
      // 23505 = et parallelt kald nåede at gemme først. Ikke en fejl.
      if (error.code === '23505') {
        return { status: 'skipped', message: 'Analysen var allerede gemt.' };
      }
      return { status: 'error', message: error.message };
    }

    if (call.lead_id) {
      await supabase.from('activities').insert({
        org_id: call.org_id,
        lead_id: call.lead_id,
        call_id: callId,
        user_id: call.user_id,
        type: 'ai_analysis',
        title: 'AI-analyse af opkald',
        body: analysis.summary,
        metadata: {
          sentiment: analysis.sentiment,
          outcome: analysis.outcome,
          lead_score: analysis.lead_score,
        },
      });

      // Scoren opdateres, men leadets status røres ikke: den hører under
      // sælgerens disposition, ikke under modellens vurdering.
      await supabase
        .from('leads')
        .update({ score: analysis.lead_score })
        .eq('id', call.lead_id);
    }

    return { status: 'ok' };
  } catch (error) {
    if (error instanceof AnalysisError) {
      return { status: 'skipped', message: error.message };
    }
    console.error('[ai] analysen fejlede for opkald', callId, error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Ukendt fejl.',
    };
  }
}
