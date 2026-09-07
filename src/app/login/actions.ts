'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/setup';

export interface AuthFormState {
  error?: string;
  /** Sat når fejlen skyldes manglende opsætning, så UI'et kan linke derhen. */
  setupNeeded?: boolean;
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!isSupabaseConfigured()) {
    return { error: 'Appen mangler forbindelse til databasen.', setupNeeded: true };
  }

  if (!email || !password) {
    return { error: 'Udfyld både e-mail og adgangskode.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Forkert e-mail eller adgangskode.' };
  }

  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') ? next : '/dashboard');
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const orgName = String(formData.get('org_name') ?? '').trim();

  if (!isSupabaseConfigured()) {
    return { error: 'Appen mangler forbindelse til databasen.', setupNeeded: true };
  }

  if (!email || !password || !orgName) {
    return { error: 'Udfyld e-mail, adgangskode og firmanavn.' };
  }

  if (password.length < 8) {
    return { error: 'Adgangskoden skal være mindst 8 tegn.' };
  }

  const supabase = await createClient();
  // org_name og full_name læses af handle_new_user-triggeren, som opretter
  // organisationen og profilen.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, org_name: orgName } },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
