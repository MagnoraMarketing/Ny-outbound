import { z } from 'zod';

/**
 * Formen på den analyse Claude skal levere for et opkald.
 *
 * Ligger for sig selv uden server-only-afhængigheder, så skemaet kan bruges
 * både af analysen og af tests.
 */
export const callAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('Kort referat af samtalen på dansk, højst tre sætninger.'),

  sentiment: z
    .enum(['positiv', 'neutral', 'negativ'])
    .describe('Kundens overordnede stemning i samtalen.'),

  outcome: z
    .enum([
      'møde_booket',
      'interesseret',
      'ring_igen',
      'ikke_interesseret',
      'forkert_person',
      'intet_svar',
      'uklart',
    ])
    .describe('Hvad samtalen reelt endte med.'),

  objections: z
    .array(
      z.object({
        type: z
          .string()
          .describe('Kort betegnelse, fx "pris", "timing", "har leverandør".'),
        quote: z.string().describe('Kundens egne ord, citeret fra samtalen.'),
        handled: z.boolean().describe('Om sælgeren adresserede indvendingen.'),
      }),
    )
    .describe('Indvendinger kunden rejste. Tom liste hvis ingen.'),

  buying_signals: z
    .array(z.string())
    .describe('Konkrete købssignaler fra kunden. Tom liste hvis ingen.'),

  next_action: z
    .string()
    .describe('Den ene handling sælgeren bør tage nu, formuleret konkret.'),

  suggested_disposition_code: z
    .string()
    .describe('Koden på den disposition der passer bedst blandt de opgivne.'),

  follow_up_in_hours: z
    .number()
    .int()
    .min(0)
    .max(2160)
    .describe('Timer til opfølgning. 0 hvis der ikke skal følges op.'),

  lead_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Hvor lovende leadet er efter samtalen, 0-100.'),

  coaching: z
    .object({
      styrker: z.array(z.string()).describe('Hvad sælgeren gjorde godt.'),
      forbedringer: z.array(z.string()).describe('Hvad sælgeren kan gøre bedre.'),
    })
    .describe('Feedback til sælgeren.'),
});

export type CallAnalysis = z.infer<typeof callAnalysisSchema>;
