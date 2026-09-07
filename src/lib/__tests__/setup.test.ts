import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isSupabaseConfigured, setupStatus } from '@/lib/setup';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELNYX_API_KEY',
  'TELNYX_CONNECTION_ID',
  'TELNYX_PUBLIC_KEY',
  'ANTHROPIC_API_KEY',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('isSupabaseConfigured', () => {
  it('er falsk når variablerne mangler', () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('kræver både URL og nøgle', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    expect(isSupabaseConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'nøgle';
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('regner en tom streng som manglende', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'nøgle';
    expect(isSupabaseConfigured()).toBe(false);
  });
});

describe('setupStatus', () => {
  it('markerer Supabase som påkrævet og resten som valgfri', () => {
    const groups = setupStatus();
    expect(groups.find((g) => g.name === 'Supabase')?.required).toBe(true);
    expect(groups.find((g) => g.name === 'Telnyx')?.required).toBe(false);
    expect(groups.find((g) => g.name === 'Claude')?.required).toBe(false);
  });

  it('lister præcis de variabler der mangler', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';

    const supabase = setupStatus().find((g) => g.name === 'Supabase');
    expect(supabase?.missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });

  it('melder intet manglende når alt er sat', () => {
    for (const key of KEYS) process.env[key] = 'værdi';
    expect(setupStatus().every((g) => g.missing.length === 0)).toBe(true);
  });
});
