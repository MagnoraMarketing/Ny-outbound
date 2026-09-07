import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Organization, Profile } from '@/lib/supabase/database.types';

export interface SessionContext {
  userId: string;
  profile: Profile;
  organization: Organization;
}

/**
 * Henter den indloggede brugers profil og organisation.
 * Sender til login hvis der ikke er nogen session.
 */
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    // Brugeren findes i auth, men profilen mangler - typisk hvis signup-
    // triggeren ikke er kørt fordi migrationerne ikke er lagt på databasen.
    redirect('/opsaetning');
  }

  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', profile.org_id)
    .single();

  if (orgError || !organization) {
    redirect('/opsaetning');
  }

  return { userId: user.id, profile, organization };
}
