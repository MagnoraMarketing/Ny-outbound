import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

import type { Database } from './database.types';

/**
 * Klient med service role-nøglen, som går uden om RLS.
 *
 * Må kun bruges hvor der ikke findes en indlogget bruger at handle på vegne af
 * - i praksis Telnyx-webhooks og baggrundsjob. Hver forespørgsel skal derfor
 * selv filtrere på org_id.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
