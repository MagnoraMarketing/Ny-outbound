import type { TranscriptSegment } from '@/lib/supabase/database.types';

export interface AnalysisContext {
  companyName: string;
  contactName: string | null;
  transcript: string;
  segments: TranscriptSegment[];
  talkSeconds: number | null;
  dispositions: { code: string; name: string }[];
}

export const SYSTEM_PROMPT = `Du er salgscoach for et dansk B2B-outboundteam.

Du får udskriften af et telefonopkald og skal vurdere det, som en erfaren
salgschef ville gøre: nøgternt, konkret og uden at pynte på resultatet.

Retningslinjer:
- Svar altid på dansk.
- Hold dig til det der faktisk blev sagt. Gæt ikke på hvad kunden mente.
- Var samtalen for kort eller uforståelig til en vurdering, så skriv det i
  referatet og sæt outcome til "uklart" frem for at konstruere en historie.
- Citater under objections skal være kundens egne ord fra udskriften.
- next_action skal være én konkret handling, ikke en liste af muligheder.
- Vær ærlig i coaching. Et opkald der gik dårligt, hjælper ingen at rose.`;

/** Bygger den udskrift modellen skal læse, med taler på hver replik. */
export function formatTranscript(
  transcript: string,
  segments: TranscriptSegment[],
): string {
  if (!segments.length) return transcript;

  return segments
    .map((segment) => {
      const speaker = segment.speaker === 'lead' ? 'Kunde' : 'Sælger';
      return `${speaker}: ${segment.text}`;
    })
    .join('\n');
}

export function buildUserPrompt(context: AnalysisContext): string {
  const dispositions = context.dispositions
    .map((d) => `- ${d.code}: ${d.name}`)
    .join('\n');

  const duration =
    context.talkSeconds != null
      ? `${Math.floor(context.talkSeconds / 60)} min ${context.talkSeconds % 60} sek`
      : 'ukendt';

  return `Virksomhed: ${context.companyName}
Kontaktperson: ${context.contactName ?? 'ukendt'}
Taletid: ${duration}

Mulige dispositioner (vælg koden på den der passer bedst):
${dispositions}

Udskrift af samtalen:
"""
${formatTranscript(context.transcript, context.segments)}
"""`;
}
