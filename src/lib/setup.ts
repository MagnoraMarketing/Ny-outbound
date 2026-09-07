/**
 * Afgør om appen overhovedet er konfigureret færdig.
 *
 * Uden Supabase-variablerne kan intet virke, og et kald til env.supabaseUrl()
 * ville kaste midt i en server component - hvilket giver en intetsigende
 * 500-side. I stedet tjekkes det her, så brugeren kan få at vide præcis
 * hvad der mangler.
 */

export interface EnvGroup {
  name: string;
  required: boolean;
  missing: string[];
  description: string;
}

function missingFrom(names: string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export function setupStatus(): EnvGroup[] {
  return [
    {
      name: 'Supabase',
      required: true,
      description: 'Database og login. Uden den kan appen ikke starte.',
      missing: missingFrom([
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
      ]),
    },
    {
      name: 'Telnyx',
      required: false,
      description: 'Telefoni. Uden den kan der ikke ringes, men resten virker.',
      missing: missingFrom([
        'TELNYX_API_KEY',
        'TELNYX_CONNECTION_ID',
        'TELNYX_PUBLIC_KEY',
      ]),
    },
    {
      name: 'Claude',
      required: false,
      description: 'AI-analyse af opkald. Uden den springes analysen over.',
      missing: missingFrom(['ANTHROPIC_API_KEY']),
    },
  ];
}

/** Sandt når Supabase er sat op, så appen kan nå at gøre noget som helst. */
export function isSupabaseConfigured(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
