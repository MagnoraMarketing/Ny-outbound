/**
 * Miljøvariabler slås op når de bruges - ikke ved import - så en manglende
 * nøgle giver en tydelig fejl det rigtige sted i stedet for at vælte build'et.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Miljøvariablen ${name} mangler. Se .env.example for hvilke værdier der skal sættes.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  telnyxApiKey: () => required('TELNYX_API_KEY'),
  telnyxConnectionId: () => required('TELNYX_CONNECTION_ID'),
  telnyxPublicKey: () => required('TELNYX_PUBLIC_KEY'),
  telnyxSipUsername: () => optional('TELNYX_SIP_USERNAME'),
  telnyxSipPassword: () => optional('TELNYX_SIP_PASSWORD'),

  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),

  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
} as const;

/** Bruges til at vise en pæn "ikke konfigureret endnu"-tilstand i UI'et. */
export function isConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]));
}
