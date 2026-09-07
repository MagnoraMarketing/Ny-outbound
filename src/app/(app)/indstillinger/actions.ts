'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils';

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { profile, organization } = await requireSession();
  const supabase = await createClient();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const rawPersonal = String(formData.get('caller_id') ?? '').trim();
  const rawOrg = String(formData.get('default_caller_id') ?? '').trim();
  const connectionId = String(formData.get('telnyx_connection_id') ?? '').trim();
  const orgName = String(formData.get('org_name') ?? '').trim();

  // Tomt felt betyder "ikke sat" - kun et udfyldt felt skal kunne være ugyldigt.
  const personalCallerId = rawPersonal ? normalizePhone(rawPersonal) : null;
  if (rawPersonal && !personalCallerId) {
    return { error: 'Dit afsendernummer ser ikke ud som et gyldigt telefonnummer.' };
  }

  const orgCallerId = rawOrg ? normalizePhone(rawOrg) : null;
  if (rawOrg && !orgCallerId) {
    return { error: 'Organisationens afsendernummer er ikke et gyldigt telefonnummer.' };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName || null, caller_id: personalCallerId })
    .eq('id', profile.id);

  if (profileError) return { error: profileError.message };

  // Kun ejere og administratorer må rette organisationens opsætning.
  if (profile.role === 'owner' || profile.role === 'admin') {
    const { error: orgError } = await supabase
      .from('organizations')
      .update({
        name: orgName || organization.name,
        default_caller_id: orgCallerId,
        telnyx_connection_id: connectionId || null,
      })
      .eq('id', organization.id);

    if (orgError) return { error: orgError.message };
  }

  revalidatePath('/indstillinger');
  revalidatePath('/', 'layout');
  return { saved: true };
}
