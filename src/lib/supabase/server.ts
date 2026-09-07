import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/env';

import type { Database } from './database.types';

/**
 * Supabase-klient til server components og route handlers. Kører som den
 * indloggede bruger, så alle forespørgsler er underlagt RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components må ikke sætte cookies. Middleware'en opdaterer
          // sessionen, så det er trygt at ignorere her.
        }
      },
    },
  });
}
