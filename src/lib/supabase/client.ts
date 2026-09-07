'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './database.types';

export function createClient() {
  // Trimmes, så et linjeskift fra en indsætning i Vercel ikke gør adressen
  // ugyldig og får klienten til at kaste ved opstart.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  );
}
