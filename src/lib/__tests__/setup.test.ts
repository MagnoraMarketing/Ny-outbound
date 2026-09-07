import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isSupabaseConfigured, isValidHttpUrl, readEnv, setupStatus } from '@/lib/setup';

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

describe('readEnv', () => {
  it('trimmer værdien, så en indsætning med linjeskift stadig virker', () => {
    process.env.TELNYX_API_KEY = '  hemmelig\n';
    expect(readEnv('TELNYX_API_KEY')).toBe('hemmelig');
  });

  it('behandler tom og whitespace-kun som ikke sat', () => {
    process.env.TELNYX_API_KEY = '   ';
    expect(readEnv('TELNYX_API_KEY')).toBeUndefined();
    delete process.env.TELNYX_API_KEY;
    expect(readEnv('TELNYX_API_KEY')).toBeUndefined();
  });
});

describe('isValidHttpUrl', () => {
  it('accepterer rigtige adresser', () => {
    expect(isValidHttpUrl('https://abc.supabase.co')).toBe(true);
    expect(isValidHttpUrl('http://localhost:54321')).toBe(true);
  });

  it('afviser de fejl folk faktisk laver', () => {
    expect(isValidHttpUrl('abc.supabase.co')).toBe(false); // uden protokol
    expect(isValidHttpUrl('"https://abc.supabase.co"')).toBe(false); // anførselstegn
    expect(isValidHttpUrl('NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co')).toBe(false);
    expect(isValidHttpUrl('postgres://abc.supabase.co')).toBe(false); // forkert protokol
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl(undefined)).toBe(false);
  });
});

describe('isSupabaseConfigured', () => {
  it('er falsk når variablerne mangler', () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('kræver både gyldig URL og nøgle', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    expect(isSupabaseConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'nøgle';
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('er falsk når URL-en er sat men ugyldig', () => {
    // Netop det tilfælde der crashede proxyen i production.
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'nøgle';
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('lader sig ikke slå ud af mellemrum omkring værdien', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '  https://x.supabase.co  ';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ' nøgle ';
    expect(isSupabaseConfigured()).toBe(true);
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
    expect(supabase?.problems.map((p) => p.name)).toEqual([
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
    expect(supabase?.problems.every((p) => p.issue === 'missing')).toBe(true);
  });

  it('skelner en ugyldig URL fra en manglende, med et fingerpeg', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'nøgle';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'hemmelig';

    const supabase = setupStatus().find((g) => g.name === 'Supabase');
    expect(supabase?.problems).toHaveLength(1);
    expect(supabase?.problems[0]).toMatchObject({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      issue: 'invalid',
    });
    expect(supabase?.problems[0].hint).toContain('https://');
  });

  it('melder intet at udbedre når alt er sat rigtigt', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    for (const key of KEYS.filter((k) => k !== 'NEXT_PUBLIC_SUPABASE_URL')) {
      process.env[key] = 'værdi';
    }
    expect(setupStatus().every((g) => g.problems.length === 0)).toBe(true);
  });
});
