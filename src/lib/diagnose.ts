/**
 * Prøver Supabase-opsætningen af i stedet for kun at se om variablerne er
 * sat. En værdi kan være til stede og alligevel forkert - nøgler fra to
 * forskellige projekter, et projekt der er gået i dvale, eller et skema der
 * aldrig blev lagt på. Alle tre ser ens ud udefra: appen sender brugeren til
 * opsætningssiden uden at sige hvorfor.
 *
 * Kun til serverbrug. Læser SUPABASE_SERVICE_ROLE_KEY.
 */

import { isValidHttpUrl, readEnv } from '@/lib/setup';

export type CheckState = 'ok' | 'fail' | 'warn' | 'skipped';

export interface Check {
  /** Kort navn på det der blev prøvet af. */
  name: string;
  state: CheckState;
  /** Hvad der skete. */
  detail: string;
  /** Hvad brugeren skal gøre ved det. */
  fix?: string;
}

export interface SupabaseDiagnosis {
  /** Projektets reference, fx `abcdefgh` i `https://abcdefgh.supabase.co`. */
  projectRef: string | null;
  checks: Check[];
}

/** Trækker projektreferencen ud af Supabase-adressen. */
export function projectRefFromUrl(url: string | undefined): string | null {
  if (!isValidHttpUrl(url)) return null;

  const host = new URL(url).hostname;
  const match = /^([a-z0-9-]+)\.supabase\.(co|in|red)$/i.exec(host);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Trækker projektreferencen ud af en Supabase-nøgle.
 *
 * De gamle nøgler er JWT'er med projektet i `ref`-feltet, så en nøgle fra et
 * andet projekt kan afsløres uden at spørge nogen. De nye nøgler
 * (`sb_publishable_…`, `sb_secret_…`) bærer det ikke, og giver null.
 */
export function projectRefFromKey(key: string | undefined): string | null {
  const value = key?.trim();
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;

  try {
    // base64url til base64, så atob kan læse den i alle runtimes.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const ref: unknown = JSON.parse(payload).ref;
    return typeof ref === 'string' && ref ? ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Sammenholder adressen og de to nøgler. Peger de på hvert sit projekt,
 * fejler login med "Invalid API key" uden at forklare hvorfor.
 */
export function checkKeysBelongTogether(
  url: string | undefined,
  anonKey: string | undefined,
  serviceKey: string | undefined,
): Check {
  const urlRef = projectRefFromUrl(url);
  const anonRef = projectRefFromKey(anonKey);
  const serviceRef = projectRefFromKey(serviceKey);

  const named: [string, string | null][] = [
    ['NEXT_PUBLIC_SUPABASE_URL', urlRef],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', anonRef],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceRef],
  ];
  const known = named.filter((entry): entry is [string, string] => entry[1] !== null);

  if (known.length < 2) {
    return {
      name: 'Samme projekt',
      state: 'skipped',
      detail:
        'Kan ikke afgøres. De nye nøgleformater (sb_publishable_…, sb_secret_…) fortæller ikke selv hvilket projekt de hører til.',
    };
  }

  const refs = new Set(known.map(([, ref]) => ref));
  if (refs.size === 1) {
    return {
      name: 'Samme projekt',
      state: 'ok',
      detail: `Adresse og nøgler hører alle til ${known[0][1]}.`,
    };
  }

  return {
    name: 'Samme projekt',
    state: 'fail',
    detail: known.map(([name, ref]) => `${name} → ${ref}`).join(', '),
    fix: 'Værdierne kommer fra hvert sit Supabase-projekt. Hent alle tre under Project Settings → API i ét og samme projekt.',
  };
}

interface ProbeResult {
  status: number;
  body: string;
}

async function probe(
  fetchImpl: typeof fetch,
  url: string,
  key: string,
  extraHeaders: Record<string, string> = {},
): Promise<ProbeResult | Error> {
  try {
    const response = await fetchImpl(url, {
      headers: { apikey: key, ...extraHeaders },
      // Et projekt i dvale svarer ikke. Uden en grænse ville opsætningssiden
      // hænge lige så længe som den bruger der prøver at forstå hvorfor.
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** Sandt når PostgREST svarer at tabellen ikke findes. */
function isMissingTable(result: ProbeResult): boolean {
  if (result.status !== 404) return false;
  // PostgREST svarer 404 med Postgres' egen fejlkode for ukendt tabel.
  return result.body.includes('42P01') || result.body.includes('does not exist');
}

/**
 * Kører de tre spørgsmål der afgør om Supabase-delen virker: svarer
 * projektet, bliver nøglerne taget imod, og findes skemaet.
 */
export async function diagnoseSupabase(
  fetchImpl: typeof fetch = fetch,
): Promise<SupabaseDiagnosis> {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = projectRefFromUrl(url);

  const checks: Check[] = [checkKeysBelongTogether(url, anonKey, serviceKey)];

  if (!isValidHttpUrl(url) || !anonKey) {
    checks.push({
      name: 'Forbindelse',
      state: 'skipped',
      detail: 'Springes over indtil adressen og anon-nøglen er sat.',
    });
    return { projectRef, checks };
  }

  const base = url.replace(/\/+$/, '');
  const health = await probe(fetchImpl, `${base}/auth/v1/health`, anonKey);

  if (health instanceof Error) {
    checks.push({
      name: 'Forbindelse',
      state: 'fail',
      detail: `Projektet svarer ikke (${health.name === 'TimeoutError' ? 'tidsfristen løb ud' : health.message}).`,
      fix: 'Typisk et projekt i dvale. Åbn Supabase-dashboardet og genstart det - eller ret adressen, hvis den peger et forkert sted hen.',
    });
    return { projectRef, checks };
  }

  if (health.status === 401) {
    checks.push({
      name: 'Forbindelse',
      state: 'fail',
      detail: 'Projektet svarer, men afviser anon-nøglen (HTTP 401).',
      fix: 'Hent NEXT_PUBLIC_SUPABASE_ANON_KEY forfra under Project Settings → API.',
    });
    return { projectRef, checks };
  }

  if (health.status === 403) {
    // Supabase afviser en forkert nøgle med 401. Et 403 kommer typisk fra
    // noget mellem appen og projektet - en proxy eller en firewall.
    checks.push({
      name: 'Forbindelse',
      state: 'fail',
      detail: 'Adgang nægtet (HTTP 403).',
      fix: 'Kommer sjældent fra Supabase selv. Se efter en proxy eller firewall mellem appen og projektet, og tjek at anon-nøglen ikke er spærret.',
    });
    return { projectRef, checks };
  }

  if (health.status >= 400) {
    checks.push({
      name: 'Forbindelse',
      state: 'fail',
      detail: `Uventet svar fra projektet (HTTP ${health.status}).`,
    });
    return { projectRef, checks };
  }

  checks.push({
    name: 'Forbindelse',
    state: 'ok',
    detail: 'Projektet svarer og tager imod anon-nøglen.',
  });

  if (!serviceKey) {
    checks.push({
      name: 'Skema',
      state: 'skipped',
      detail: 'Springes over indtil SUPABASE_SERVICE_ROLE_KEY er sat.',
    });
    return { projectRef, checks };
  }

  const table = await probe(
    fetchImpl,
    `${base}/rest/v1/organizations?select=id&limit=1`,
    serviceKey,
    { Authorization: `Bearer ${serviceKey}` },
  );

  if (table instanceof Error) {
    checks.push({
      name: 'Skema',
      state: 'fail',
      detail: `Kunne ikke slå tabellerne op (${table.message}).`,
    });
    return { projectRef, checks };
  }

  if (table.status === 401 || table.status === 403) {
    checks.push({
      name: 'Skema',
      state: 'fail',
      detail: `Service role-nøglen bliver afvist (HTTP ${table.status}).`,
      fix: 'Hent SUPABASE_SERVICE_ROLE_KEY forfra under Project Settings → API. Den skal være fra samme projekt som adressen.',
    });
    return { projectRef, checks };
  }

  if (isMissingTable(table)) {
    checks.push({
      name: 'Skema',
      state: 'fail',
      detail: 'Tabellen organizations findes ikke i databasen.',
      fix: 'Kør hele supabase/schema.sql i Supabase’ SQL Editor. Den opretter tabellerne, RLS-politikkerne og den trigger der giver en ny bruger en organisation og en profil.',
    });
    return { projectRef, checks };
  }

  if (table.status >= 400) {
    checks.push({
      name: 'Skema',
      state: 'fail',
      detail: `Uventet svar da tabellerne blev slået op (HTTP ${table.status}).`,
    });
    return { projectRef, checks };
  }

  checks.push({
    name: 'Skema',
    state: 'ok',
    detail: 'Tabellerne er på plads.',
  });

  return { projectRef, checks };
}
