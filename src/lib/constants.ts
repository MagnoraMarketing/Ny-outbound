import type { CallStatus, DispositionCategory, LeadStatus } from '@/lib/supabase/database.types';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Ny',
  attempting: 'Forsøgt kontaktet',
  contacted: 'Kontaktet',
  qualified: 'Kvalificeret',
  meeting_booked: 'Møde booket',
  won: 'Vundet',
  lost: 'Tabt',
  dnc: 'Må ikke kontaktes',
};

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  attempting: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  contacted: 'bg-sky-100 text-sky-800 ring-sky-600/20',
  qualified: 'bg-indigo-100 text-indigo-800 ring-indigo-600/20',
  meeting_booked: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  won: 'bg-green-600 text-white ring-green-700/20',
  lost: 'bg-rose-100 text-rose-800 ring-rose-600/20',
  dnc: 'bg-zinc-800 text-zinc-100 ring-zinc-900/20',
};

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  queued: 'I kø',
  initiated: 'Kalder op',
  ringing: 'Ringer',
  answered: 'I samtale',
  completed: 'Gennemført',
  busy: 'Optaget',
  no_answer: 'Intet svar',
  failed: 'Fejlede',
  canceled: 'Afbrudt',
  voicemail: 'Telefonsvarer',
};

export const DISPOSITION_CATEGORY_LABELS: Record<DispositionCategory, string> = {
  connected: 'Kom igennem',
  no_answer: 'Intet svar',
  not_interested: 'Ikke interesseret',
  meeting: 'Møde',
  callback: 'Ring igen',
  dnc: 'Må ikke kontaktes',
  wrong_number: 'Forkert nummer',
};

/** Statusser hvor et lead stadig er i spil og må ringes til. */
export const DIALABLE_STATUSES: LeadStatus[] = ['new', 'attempting', 'contacted', 'qualified'];
