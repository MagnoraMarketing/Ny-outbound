'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/lib/supabase/database.types';
import type { ParsedLead } from '@/lib/csv';

export interface ImportResult {
  error?: string;
  imported?: number;
  skippedExisting?: number;
  listId?: string;
}

/**
 * Gemmer et sæt indlæste leads under en (ny eller eksisterende) liste.
 *
 * Numre der allerede findes i organisationen springes over frem for at fejle:
 * det er normalt at købe lister der overlapper med dem man allerede har.
 */
export async function importLeads(
  listName: string,
  leads: ParsedLead[],
): Promise<ImportResult> {
  const { profile } = await requireSession();
  const supabase = await createClient();

  if (!leads.length) {
    return { error: 'Der er ingen gyldige leads at importere.' };
  }

  // Frasortér numre organisationen allerede har. Det unikke indeks ville
  // afvise dem alligevel, men her får brugeren et tal i stedet for en fejl.
  const phones = leads.map((lead) => lead.phone).filter((p): p is string => Boolean(p));
  const existing = new Set<string>();

  // Del op i klumper, så URL'en ikke bliver for lang ved store filer.
  for (let i = 0; i < phones.length; i += 200) {
    const chunk = phones.slice(i, i + 200);
    const { data } = await supabase.from('leads').select('phone').in('phone', chunk);
    for (const row of data ?? []) {
      if (row.phone) existing.add(row.phone);
    }
  }

  const fresh = leads.filter((lead) => lead.phone && !existing.has(lead.phone));

  // Er alt kendt i forvejen, oprettes der ingen liste. Ellers ville et
  // gentaget importforsøg - fx et dobbeltklik - efterlade en tom liste
  // hver gang, uden et eneste lead i sig.
  if (!fresh.length) {
    return { imported: 0, skippedExisting: leads.length };
  }

  const name = listName.trim() || `Import ${new Date().toLocaleDateString('da-DK')}`;

  const { data: list, error: listError } = await supabase
    .from('lead_lists')
    .insert({
      org_id: profile.org_id,
      name,
      source: 'csv',
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (listError || !list) {
    return { error: `Kunne ikke oprette listen: ${listError?.message ?? 'ukendt fejl'}` };
  }

  const rows = fresh.map((lead) => ({
    ...lead,
    org_id: profile.org_id,
    list_id: list.id,
    owner_id: profile.id,
  }));

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await supabase
      .from('leads')
      .insert(chunk, { count: 'exact' });

    if (error) {
      return {
        error: `Importen stoppede efter ${imported} leads: ${error.message}`,
        imported,
        listId: list.id,
      };
    }
    imported += count ?? chunk.length;
  }

  await supabase.from('activities').insert({
    org_id: profile.org_id,
    user_id: profile.id,
    type: 'import',
    title: `Importerede ${imported} leads`,
    body: `Liste: ${name}`,
    metadata: { list_id: list.id, skipped: leads.length - fresh.length },
  });

  revalidatePath('/leads');
  return { imported, skippedExisting: leads.length - fresh.length, listId: list.id };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from('leads')
    .select('status')
    .eq('id', leadId)
    .single();

  const { error } = await supabase
    .from('leads')
    .update({ status, do_not_call: status === 'dnc' })
    .eq('id', leadId);

  if (error) return { error: error.message };

  await supabase.from('activities').insert({
    org_id: profile.org_id,
    lead_id: leadId,
    user_id: profile.id,
    type: 'status_change',
    title: 'Status ændret',
    body: before ? `${before.status} → ${status}` : status,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  return {};
}

export async function addNote(leadId: string, body: string) {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const trimmed = body.trim();
  if (!trimmed) return { error: 'Noten er tom.' };

  const { error } = await supabase.from('activities').insert({
    org_id: profile.org_id,
    lead_id: leadId,
    user_id: profile.id,
    type: 'note',
    title: 'Note',
    body: trimmed,
  });

  if (error) return { error: error.message };

  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function createFollowUp(leadId: string, title: string, dueAt: string) {
  const { profile } = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.from('tasks').insert({
    org_id: profile.org_id,
    lead_id: leadId,
    assigned_to: profile.id,
    title: title.trim() || 'Følg op',
    due_at: new Date(dueAt).toISOString(),
    source: 'manual',
  });

  if (error) return { error: error.message };

  await supabase.from('leads').update({ next_follow_up_at: dueAt }).eq('id', leadId);

  revalidatePath(`/leads/${leadId}`);
  return {};
}
