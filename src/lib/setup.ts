/**
 * Afgør om appen er konfigureret færdig, og hvad der eventuelt er galt.
 *
 * Både manglende og ugyldige værdier fanges her. Ellers kaster
 * createServerClient() inde i proxyen, og så får brugeren en bar
 * "Internal Server Error" på hver eneste rute - uden en chance for at se
 * hvilken variabel der er noget i vejen med.
 */

/** Læser en variabel og trimmer den, så et strejfende mellemrum eller
 * linjeskift fra en indsætning ikke vælter appen. */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export type EnvIssue = 'missing' | 'invalid';

export interface EnvProblem {
  name: string;
  issue: EnvIssue;
  hint?: string;
}

export interface EnvGroup {
  name: string;
  required: boolean;
  description: string;
  problems: EnvProblem[];
}

function checkPresent(names: string[]): EnvProblem[] {
  return names
    .filter((name) => !readEnv(name))
    .map((name) => ({ name, issue: 'missing' as const }));
}

export function setupStatus(): EnvGroup[] {
  const supabase: EnvProblem[] = [];

  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (!url) {
    supabase.push({ name: 'NEXT_PUBLIC_SUPABASE_URL', issue: 'missing' });
  } else if (!isValidHttpUrl(url)) {
    supabase.push({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      issue: 'invalid',
      hint: 'Skal være en fuld adresse, fx https://dit-projekt.supabase.co - med https:// foran og uden anførselstegn.',
    });
  }

  supabase.push(
    ...checkPresent(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']),
  );

  return [
    {
      name: 'Supabase',
      required: true,
      description: 'Database og login. Uden den kan appen ikke starte.',
      problems: supabase,
    },
    {
      name: 'Telnyx',
      required: false,
      description: 'Telefoni. Uden den kan der ikke ringes, men resten virker.',
      problems: checkPresent([
        'TELNYX_API_KEY',
        'TELNYX_CONNECTION_ID',
        'TELNYX_PUBLIC_KEY',
      ]),
    },
    {
      name: 'Claude',
      required: false,
      description: 'AI-analyse af opkald. Uden den springes analysen over.',
      problems: checkPresent(['ANTHROPIC_API_KEY']),
    },
  ];
}

/**
 * Sandt når Supabase kan bruges. Kræver at URL'en faktisk er en URL - en
 * sat men ugyldig værdi er værre end en manglende, fordi klienten så kaster
 * i stedet for at lade os vise opsætningssiden.
 */
export function isSupabaseConfigured(): boolean {
  return (
    isValidHttpUrl(readEnv('NEXT_PUBLIC_SUPABASE_URL')) &&
    Boolean(readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
  );
}
