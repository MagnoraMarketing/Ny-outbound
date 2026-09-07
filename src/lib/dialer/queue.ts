import { DIALABLE_STATUSES } from '@/lib/constants';
import type { Lead } from '@/lib/supabase/database.types';

/** De felter køen har brug for. Holder funktionerne testbare uden hele rækken. */
export type QueueLead = Pick<
  Lead,
  | 'id'
  | 'company_name'
  | 'phone'
  | 'status'
  | 'do_not_call'
  | 'call_attempts'
  | 'last_call_at'
  | 'next_follow_up_at'
>;

/** Efter så mange forgæves forsøg lægges leadet til side. */
export const MAX_ATTEMPTS = 8;

/** Mindste tid mellem to opkald til samme lead. */
export const MIN_MINUTES_BETWEEN_ATTEMPTS = 60;

export type SkipReason =
  | 'do_not_call'
  | 'no_phone'
  | 'status'
  | 'max_attempts'
  | 'too_soon'
  | 'scheduled_later';

export function skipReason(lead: QueueLead, now: Date = new Date()): SkipReason | null {
  if (lead.do_not_call) return 'do_not_call';
  if (!lead.phone) return 'no_phone';
  if (!DIALABLE_STATUSES.includes(lead.status)) return 'status';
  if (lead.call_attempts >= MAX_ATTEMPTS) return 'max_attempts';

  // En planlagt opfølgning frem i tiden betyder at leadet er lovet ro indtil da.
  if (lead.next_follow_up_at && new Date(lead.next_follow_up_at) > now) {
    return 'scheduled_later';
  }

  if (lead.last_call_at) {
    const minutesSince = (now.getTime() - new Date(lead.last_call_at).getTime()) / 60000;
    if (minutesSince < MIN_MINUTES_BETWEEN_ATTEMPTS) return 'too_soon';
  }

  return null;
}

export function isCallable(lead: QueueLead, now: Date = new Date()): boolean {
  return skipReason(lead, now) === null;
}

/**
 * Rækkefølgen leads ringes i:
 *  1. forfaldne opfølgninger - nogen har lovet at ringe tilbage
 *  2. leads der aldrig er forsøgt
 *  3. færrest forsøg først
 *  4. længst tid siden sidste forsøg
 */
export function sortQueue(leads: QueueLead[], now: Date = new Date()): QueueLead[] {
  const overdue = (lead: QueueLead) =>
    lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= now ? 0 : 1;

  return [...leads].sort((a, b) => {
    const byOverdue = overdue(a) - overdue(b);
    if (byOverdue !== 0) return byOverdue;

    // Blandt forfaldne opfølgninger tages den ældste aftale først.
    if (overdue(a) === 0) {
      const diff =
        new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime();
      if (diff !== 0) return diff;
    }

    const byAttempts = a.call_attempts - b.call_attempts;
    if (byAttempts !== 0) return byAttempts;

    const aLast = a.last_call_at ? new Date(a.last_call_at).getTime() : 0;
    const bLast = b.last_call_at ? new Date(b.last_call_at).getTime() : 0;
    return aLast - bLast;
  });
}

/** Bygger den færdige kø: kun leads der må ringes til, i rigtig rækkefølge. */
export function buildQueue(leads: QueueLead[], now: Date = new Date()): QueueLead[] {
  return sortQueue(
    leads.filter((lead) => isCallable(lead, now)),
    now,
  );
}

/**
 * Almindelig dansk B2B-ringetid: hverdage 8-17 dansk tid.
 * Bruges til at advare sælgeren, ikke til at blokere - der findes brancher
 * hvor det giver god mening at ringe uden for de tider.
 */
export function withinCallingHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);

  if (['Sat', 'Sun'].includes(weekday)) return false;
  return hour >= 8 && hour < 17;
}

/**
 * Hvor mange linjer der må åbnes i parallel-mode.
 *
 * Loven om god markedsføringsskik og almindelig anstændighed sætter grænsen:
 * ringer man ad flere linjer end man kan nå at tage, får folk stille opkald.
 * Derfor et hårdt loft, uanset hvad brugeren beder om.
 */
export const MAX_PARALLEL_LINES = 4;

export function clampLines(requested: number): number {
  if (!Number.isFinite(requested)) return 1;
  return Math.min(MAX_PARALLEL_LINES, Math.max(1, Math.floor(requested)));
}
