/**
 * Miljøvariabler slås op når de bruges - ikke ved import - så en manglende
 * nøgle giver en tydelig fejl det rigtige sted i stedet for at vælte build'et.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Miljøvariablen ${name} mangler. Se .env.example for hvilke værdier der skal sættes.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  // Trimmes, så en værdi der kun er mellemrum tæller som ikke sat.
  return process.env[name]?.trim() || undefined;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  telnyxApiKey: () => required('TELNYX_API_KEY'),
  telnyxConnectionId: () => required('TELNYX_CONNECTION_ID'),
  telnyxPublicKey: () => required('TELNYX_PUBLIC_KEY'),

  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),

  appUrl: () => appUrl(),
} as const;

/**
 * Appens egen offentlige adresse. Bruges blandt andet til at fortælle Telnyx
 * hvor opkaldshændelser skal sendes hen, så en forkert værdi betyder at
 * telefonien stille holder op med at virke.
 *
 * Kører vi på Vercel, spørger vi Vercel. Platformen kender projektets
 * produktionsdomæne - også når det er et eget domæne - og den værdi kan
 * hverken blive forældet eller tastet forkert.
 *
 * Derfor vinder den over NEXT_PUBLIC_APP_URL. Det er ikke teoretisk: den
 * variabel har to gange stået med adressen på et Supabase-projekt, og
 * eftersom hvert opkald selv sender sin webhook_url med, ville hver eneste
 * opkaldshændelse være blevet sendt derhen - uden en fejl noget sted.
 * En håndsat adresse er kun bedre end platformens når platformen tier.
 */
export function appUrl(): string {
  // Sættes automatisk af Vercel til projektets produktionsdomæne.
  const production = optional('VERCEL_PROJECT_PRODUCTION_URL');
  if (production) return `https://${production}`;

  // Den aktuelle deployments egen adresse, fx på preview.
  const deployment = optional('VERCEL_URL');
  if (deployment) return `https://${deployment}`;

  // Uden for Vercel - lokal kørsel eller egen hosting - er den håndsatte
  // værdi det eneste vi har at gå efter.
  const configured = optional('NEXT_PUBLIC_APP_URL');
  if (configured) return configured.replace(/\/+$/, '');

  return 'http://localhost:3000';
}

/** Bruges til at vise en pæn "ikke konfigureret endnu"-tilstand i UI'et. */
export function isConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}
