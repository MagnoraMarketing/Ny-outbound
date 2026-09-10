import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkKeysBelongTogether,
  diagnoseSupabase,
  projectRefFromKey,
  projectRefFromUrl,
} from '@/lib/diagnose';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
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

/** Bygger en JWT med det ref og den rolle en Supabase-nøgle har. */
function key(ref: string, role = 'anon'): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', ref, role })}.signatur`;
}

/** En fetch der svarer fast, uanset hvad den bliver spurgt om. */
function respondWith(
  routes: Record<string, { status: number; body?: string } | Error>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) throw new Error(`uventet kald til ${url}`);

    const [, result] = match;
    if (result instanceof Error) throw result;

    return new Response(result.body ?? '', { status: result.status });
  }) as typeof fetch;
}

const HEALTH = '/auth/v1/health';
const TABLE = '/rest/v1/organizations';

describe('projectRefFromUrl', () => {
  it('finder referencen i en Supabase-adresse', () => {
    expect(projectRefFromUrl('https://jrnivwqlvmoniwarpjlr.supabase.co')).toBe(
      'jrnivwqlvmoniwarpjlr',
    );
  });

  it('tåler en skråstreg til sidst og store bogstaver', () => {
    expect(projectRefFromUrl('https://ABCDEF.supabase.co/')).toBe('abcdef');
  });

  it('giver null for noget der ikke er en Supabase-adresse', () => {
    expect(projectRefFromUrl('https://eksempel.dk')).toBeNull();
    expect(projectRefFromUrl('ikke en url')).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
  });
});

describe('projectRefFromKey', () => {
  it('læser referencen ud af en gammel JWT-nøgle', () => {
    expect(projectRefFromKey(key('abcdefgh'))).toBe('abcdefgh');
  });

  it('giver null for de nye nøgleformater, der ikke bærer et ref', () => {
    expect(projectRefFromKey('sb_publishable_5miaT-FI2BXyoo0DvtLxxg')).toBeNull();
    expect(projectRefFromKey('sb_secret_hemmelig')).toBeNull();
  });

  it('giver null i stedet for at kaste på noget uforståeligt', () => {
    expect(projectRefFromKey('a.b.c')).toBeNull();
    expect(projectRefFromKey('')).toBeNull();
    expect(projectRefFromKey(undefined)).toBeNull();
  });
});

describe('checkKeysBelongTogether', () => {
  it('godtager adresse og nøgler fra samme projekt', () => {
    const check = checkKeysBelongTogether(
      'https://abcdefgh.supabase.co',
      key('abcdefgh'),
      key('abcdefgh', 'service_role'),
    );
    expect(check.state).toBe('ok');
  });

  it('fanger en nøgle fra et andet projekt', () => {
    const check = checkKeysBelongTogether(
      'https://abcdefgh.supabase.co',
      key('abcdefgh'),
      key('etandetprojekt', 'service_role'),
    );
    expect(check.state).toBe('fail');
    expect(check.detail).toContain('etandetprojekt');
    expect(check.fix).toBeDefined();
  });

  it('fanger også en adresse der peger et andet sted hen end nøglerne', () => {
    const check = checkKeysBelongTogether(
      'https://etandetprojekt.supabase.co',
      key('abcdefgh'),
      key('abcdefgh', 'service_role'),
    );
    expect(check.state).toBe('fail');
  });

  it('melder pas frem for at gætte, når nøglerne ikke bærer et projekt', () => {
    const check = checkKeysBelongTogether(
      'https://abcdefgh.supabase.co',
      'sb_publishable_noget',
      'sb_secret_noget',
    );
    expect(check.state).toBe('skipped');
  });
});

describe('diagnoseSupabase', () => {
  function configure(url = 'https://abcdefgh.supabase.co') {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key('abcdefgh');
    process.env.SUPABASE_SERVICE_ROLE_KEY = key('abcdefgh', 'service_role');
  }

  function find(checks: { name: string }[], name: string) {
    const check = checks.find((c) => c.name === name);
    if (!check) throw new Error(`ingen kontrol ved navn ${name}`);
    return check as { name: string; state: string; detail: string; fix?: string };
  }

  it('melder alt klar når projektet svarer og tabellerne findes', async () => {
    configure();
    const { checks, projectRef } = await diagnoseSupabase(
      respondWith({ [HEALTH]: { status: 200 }, [TABLE]: { status: 200, body: '[]' } }),
    );

    expect(projectRef).toBe('abcdefgh');
    expect(find(checks, 'Forbindelse').state).toBe('ok');
    expect(find(checks, 'Skema').state).toBe('ok');
  });

  it('peger på dvale når projektet ikke svarer', async () => {
    configure();
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';

    const { checks } = await diagnoseSupabase(respondWith({ [HEALTH]: timeout }));
    const connection = find(checks, 'Forbindelse');

    expect(connection.state).toBe('fail');
    expect(connection.fix).toContain('dvale');
    // Skemaet kan ikke slås op når projektet ikke svarer.
    expect(checks.some((c) => c.name === 'Skema')).toBe(false);
  });

  it('skelner en afvist anon-nøgle fra et projekt der ikke svarer', async () => {
    configure();
    const { checks } = await diagnoseSupabase(
      respondWith({ [HEALTH]: { status: 401 } }),
    );

    const connection = find(checks, 'Forbindelse');
    expect(connection.state).toBe('fail');
    expect(connection.detail).toContain('afviser anon-nøglen');
  });

  it('lægger ikke et 403 fra en proxy over på nøglen', async () => {
    configure();
    const { checks } = await diagnoseSupabase(
      respondWith({ [HEALTH]: { status: 403 } }),
    );

    const connection = find(checks, 'Forbindelse');
    expect(connection.state).toBe('fail');
    expect(connection.detail).not.toContain('anon-nøglen');
    expect(connection.fix).toContain('proxy');
  });

  it('fanger et manglende skema og henviser til schema.sql', async () => {
    configure();
    const { checks } = await diagnoseSupabase(
      respondWith({
        [HEALTH]: { status: 200 },
        [TABLE]: {
          status: 404,
          body: '{"code":"42P01","message":"relation \\"public.organizations\\" does not exist"}',
        },
      }),
    );

    const schema = find(checks, 'Skema');
    expect(schema.state).toBe('fail');
    expect(schema.fix).toContain('schema.sql');
  });

  it('fanger en afvist service role-nøgle', async () => {
    configure();
    const { checks } = await diagnoseSupabase(
      respondWith({ [HEALTH]: { status: 200 }, [TABLE]: { status: 401 } }),
    );

    expect(find(checks, 'Skema').state).toBe('fail');
    expect(find(checks, 'Skema').detail).toContain('Service role-nøglen');
  });

  it('springer prøven over i stedet for at kalde ud uden opsætning', async () => {
    const { checks } = await diagnoseSupabase(respondWith({}));
    expect(find(checks, 'Forbindelse').state).toBe('skipped');
  });

  it('viser projektreferencen selv når forbindelsen fejler', async () => {
    configure('https://etandetprojekt.supabase.co');
    const { projectRef } = await diagnoseSupabase(
      respondWith({ [HEALTH]: new Error('getaddrinfo ENOTFOUND') }),
    );
    expect(projectRef).toBe('etandetprojekt');
  });
});
