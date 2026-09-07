import { describe, expect, it } from 'vitest';

import { buildUserPrompt, formatTranscript } from '@/lib/ai/prompt';
import { callAnalysisSchema } from '@/lib/ai/schema';

describe('formatTranscript', () => {
  it('sætter talernavne på replikkerne', () => {
    const output = formatTranscript('', [
      { speaker: 'agent', start: 0, end: 2, text: 'Goddag, det er Anna fra Magnora.' },
      { speaker: 'lead', start: 2, end: 4, text: 'Hej Anna.' },
    ]);

    expect(output).toBe('Sælger: Goddag, det er Anna fra Magnora.\nKunde: Hej Anna.');
  });

  it('falder tilbage til den rå tekst uden segmenter', () => {
    expect(formatTranscript('En lang udskrift', [])).toBe('En lang udskrift');
  });
});

describe('buildUserPrompt', () => {
  const context = {
    companyName: 'Testfirma ApS',
    contactName: 'Kim Kunde',
    transcript: 'Goddag',
    segments: [],
    talkSeconds: 125,
    dispositions: [
      { code: 'meeting_booked', name: 'Møde booket' },
      { code: 'callback', name: 'Ring igen' },
    ],
  };

  it('tager virksomhed, kontakt og taletid med', () => {
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain('Testfirma ApS');
    expect(prompt).toContain('Kim Kunde');
    expect(prompt).toContain('2 min 5 sek');
  });

  it('lister de dispositioner modellen må vælge imellem', () => {
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain('- meeting_booked: Møde booket');
    expect(prompt).toContain('- callback: Ring igen');
  });

  it('skriver ukendt når kontaktpersonen mangler', () => {
    expect(buildUserPrompt({ ...context, contactName: null })).toContain(
      'Kontaktperson: ukendt',
    );
  });

  it('håndterer manglende taletid', () => {
    expect(buildUserPrompt({ ...context, talkSeconds: null })).toContain('Taletid: ukendt');
  });
});

describe('callAnalysisSchema', () => {
  const valid = {
    summary: 'Kunden var interesseret og vil have en pris tilsendt.',
    sentiment: 'positiv',
    outcome: 'interesseret',
    objections: [{ type: 'pris', quote: 'Det lyder dyrt', handled: true }],
    buying_signals: ['Bad om et tilbud'],
    next_action: 'Send tilbud senest i morgen formiddag.',
    suggested_disposition_code: 'interested',
    follow_up_in_hours: 24,
    lead_score: 72,
    coaching: { styrker: ['God behovsafdækning'], forbedringer: ['Luk hårdere'] },
  };

  it('accepterer et fuldt gyldigt svar', () => {
    expect(callAnalysisSchema.parse(valid)).toMatchObject({ lead_score: 72 });
  });

  it('afviser en stemning uden for de tilladte værdier', () => {
    expect(() => callAnalysisSchema.parse({ ...valid, sentiment: 'glad' })).toThrow();
  });

  it('afviser en score uden for skalaen', () => {
    expect(() => callAnalysisSchema.parse({ ...valid, lead_score: 140 })).toThrow();
    expect(() => callAnalysisSchema.parse({ ...valid, lead_score: -1 })).toThrow();
  });

  it('afviser en urimeligt lang opfølgningsfrist', () => {
    expect(() => callAnalysisSchema.parse({ ...valid, follow_up_in_hours: 99999 })).toThrow();
  });

  it('afviser hvis coaching mangler', () => {
    const uden: Record<string, unknown> = { ...valid };
    delete uden.coaching;
    expect(() => callAnalysisSchema.parse(uden)).toThrow();
  });

  it('tillader tomme lister for indvendinger og signaler', () => {
    const parsed = callAnalysisSchema.parse({ ...valid, objections: [], buying_signals: [] });
    expect(parsed.objections).toEqual([]);
  });
});
