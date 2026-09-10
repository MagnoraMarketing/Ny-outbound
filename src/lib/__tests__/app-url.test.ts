import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appUrl } from '@/lib/env';

const KEYS = ['NEXT_PUBLIC_APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'];
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

describe('appUrl', () => {
  it('bruger den konfigurerede adresse når den er sat', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://mit-domaene.dk';
    expect(appUrl()).toBe('https://mit-domaene.dk');
  });

  it('fjerner en afsluttende skråstreg, så webhook-stien ikke får to', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://mit-domaene.dk/';
    expect(appUrl()).toBe('https://mit-domaene.dk');
  });

  it('falder tilbage til Vercels produktionsdomæne', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ny-outbound.vercel.app';
    expect(appUrl()).toBe('https://ny-outbound.vercel.app');
  });

  it('falder tilbage til deploymentens egen adresse på preview', () => {
    process.env.VERCEL_URL = 'ny-outbound-abc123.vercel.app';
    expect(appUrl()).toBe('https://ny-outbound-abc123.vercel.app');
  });

  it('lader Vercels eget domæne vinde over en håndsat adresse', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://mit-domaene.dk';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ny-outbound.vercel.app';
    expect(appUrl()).toBe('https://ny-outbound.vercel.app');
  });

  it('lader ikke en Supabase-adresse i variablen kapre webhooken', () => {
    // Den præcise fejl der lammede telefonien: Supabase-projektets adresse
    // endt i feltet til appens egen. Hvert opkald sender sin webhook_url med,
    // så alle opkaldshændelser ville være gået til Supabase.
    process.env.NEXT_PUBLIC_APP_URL = 'https://ppllbptgiodtcacavlnw.supabase.co';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ny-outbound.vercel.app';
    expect(appUrl()).toBe('https://ny-outbound.vercel.app');
  });

  it('bruger den håndsatte adresse uden for Vercel, hvor platformen tier', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://mit-domaene.dk';
    expect(appUrl()).toBe('https://mit-domaene.dk');
  });

  it('bruger localhost når intet er sat', () => {
    expect(appUrl()).toBe('http://localhost:3000');
  });

  it('ignorerer en tom værdi frem for at bygge en adresse uden vært', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   ';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'ny-outbound.vercel.app';
    expect(appUrl()).toBe('https://ny-outbound.vercel.app');
  });
});
