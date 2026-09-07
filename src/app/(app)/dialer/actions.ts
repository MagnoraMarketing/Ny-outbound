'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildQueue, clampLines, type QueueLead } from '@/lib/dialer/queue';
import type { DialerMode, Lead } from '@/lib/supabase/database.types';

export interface StartSessionResult {
  error?: string;
  sessionId?: string;
}

export async function startSession(
  mode: DialerMode,
  lines: number,
  listId: string | null,
): Promise<StartSessionResult> {
  const { profile } = await requireSession();
  const supabase = await createClient();

  // Luk en eventuel session der er blevet hængende fra sidste gang.
  await supabase
    .from('dialer_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const { data, error } = await supabase
    .from('dialer_sessions')
    .insert({
      org_id: profile.org_id,
      user_id: profile.id,
      list_id: listId,
      mode,
      lines: mode === 'parallel' ? clampLines(lines) : 1,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: error?.message ?? 'Kunne ikke starte sessionen.' };
  }

  revalidatePath('/dialer');
  return { sessionId: data.id };
}

export async function endSession(sessionId: string) {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('dialer_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', profile.id);

  revalidatePath('/dialer');
  return error ? { error: error.message } : {};
}

/**
 * Henter de næste leads der må ringes til, i prioriteret rækkefølge.
 *
 * Filtreringen sker både i databasen (det den kan) og i buildQueue (resten),
 * så reglerne kun står ét sted og er dækket af tests.
 */
export async function fetchQueue(
  listId: string | null,
  limit = 25,
): Promise<{ leads: QueueLead[]; error?: string }> {
  await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from('leads')
    .select(
      'id, company_name, phone, status, do_not_call, call_attempts, last_call_at, next_follow_up_at',
    )
    .eq('do_not_call', false)
    .not('phone', 'is', null)
    .in('status', ['new', 'attempting', 'contacted', 'qualified'])
    // Hent rigeligt, da buildQueue frasorterer yderligere
    .limit(limit * 4);

  if (listId) query = query.eq('list_id', listId);

  const { data, error } = await query;

  if (error) return { leads: [], error: error.message };

  return { leads: buildQueue(data ?? []).slice(0, limit) };
}

export interface DispositionResult {
  error?: string;
}

/**
 * Registrerer udfaldet af et opkald og trækker alle følgevirkninger med:
 * leadets status, en eventuel opfølgning, mødet og sessionens tæller.
 */
export async function applyDisposition(
  callId: string,
  dispositionId: string,
  note: string,
  meetingAt?: string | null,
): Promise<DispositionResult> {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const [{ data: call }, { data: disposition }] = await Promise.all([
    supabase.from('calls').select('id, lead_id, session_id, talk_seconds').eq('id', callId).single(),
    supabase.from('dispositions').select('*').eq('id', dispositionId).single(),
  ]);

  if (!call) return { error: 'Opkaldet blev ikke fundet.' };
  if (!disposition) return { error: 'Dispositionen blev ikke fundet.' };

  const { error: callError } = await supabase
    .from('calls')
    .update({ disposition_id: dispositionId, disposition_note: note.trim() || null })
    .eq('id', callId);

  if (callError) return { error: callError.message };

  if (call.lead_id) {
    const leadUpdate: Partial<Lead> = {};

    if (disposition.sets_lead_status) {
      leadUpdate.status = disposition.sets_lead_status;
    }
    if (disposition.category === 'dnc') {
      leadUpdate.do_not_call = true;
    }

    if (disposition.follow_up_hours != null) {
      const dueAt = new Date(Date.now() + disposition.follow_up_hours * 3600_000);
      leadUpdate.next_follow_up_at = dueAt.toISOString();

      await supabase.from('tasks').insert({
        org_id: profile.org_id,
        lead_id: call.lead_id,
        assigned_to: profile.id,
        call_id: callId,
        title: `${disposition.name}: følg op`,
        due_at: dueAt.toISOString(),
        source: 'disposition',
      });
    }

    if (Object.keys(leadUpdate).length > 0) {
      await supabase.from('leads').update(leadUpdate).eq('id', call.lead_id);
    }

    if (disposition.category === 'meeting' && meetingAt) {
      await supabase.from('meetings').insert({
        org_id: profile.org_id,
        lead_id: call.lead_id,
        booked_by: profile.id,
        call_id: callId,
        title: 'Salgsmøde',
        starts_at: new Date(meetingAt).toISOString(),
      });
    }

    await supabase.from('activities').insert({
      org_id: profile.org_id,
      lead_id: call.lead_id,
      call_id: callId,
      user_id: profile.id,
      type: 'call',
      title: `Opkald: ${disposition.name}`,
      body: note.trim() || null,
    });
  }

  if (call.session_id) {
    const { data: session } = await supabase
      .from('dialer_sessions')
      .select('meetings_booked')
      .eq('id', call.session_id)
      .single();

    if (session && disposition.category === 'meeting') {
      await supabase
        .from('dialer_sessions')
        .update({ meetings_booked: session.meetings_booked + 1 })
        .eq('id', call.session_id);
    }
  }

  revalidatePath('/dialer');
  if (call.lead_id) revalidatePath(`/leads/${call.lead_id}`);
  return {};
}
