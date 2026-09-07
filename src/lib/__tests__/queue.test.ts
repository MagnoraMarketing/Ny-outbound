import { describe, expect, it } from 'vitest';

import {
  buildQueue,
  clampLines,
  isCallable,
  MAX_ATTEMPTS,
  skipReason,
  sortQueue,
  withinCallingHours,
  type QueueLead,
} from '@/lib/dialer/queue';

const NOW = new Date('2026-09-08T10:00:00Z'); // tirsdag kl. 12 dansk tid

function lead(overrides: Partial<QueueLead> = {}): QueueLead {
  return {
    id: crypto.randomUUID(),
    company_name: 'Testfirma ApS',
    phone: '+4512345678',
    status: 'new',
    do_not_call: false,
    call_attempts: 0,
    last_call_at: null,
    next_follow_up_at: null,
    ...overrides,
  };
}

describe('skipReason', () => {
  it('lader et almindeligt nyt lead passere', () => {
    expect(skipReason(lead(), NOW)).toBeNull();
  });

  it('springer over leads der ikke må kontaktes', () => {
    expect(skipReason(lead({ do_not_call: true }), NOW)).toBe('do_not_call');
  });

  it('springer over leads uden nummer', () => {
    expect(skipReason(lead({ phone: null }), NOW)).toBe('no_phone');
  });

  it('springer over lukkede statusser', () => {
    expect(skipReason(lead({ status: 'won' }), NOW)).toBe('status');
    expect(skipReason(lead({ status: 'lost' }), NOW)).toBe('status');
    expect(skipReason(lead({ status: 'dnc' }), NOW)).toBe('status');
  });

  it('lægger leadet til side efter for mange forsøg', () => {
    expect(skipReason(lead({ call_attempts: MAX_ATTEMPTS }), NOW)).toBe('max_attempts');
    expect(skipReason(lead({ call_attempts: MAX_ATTEMPTS - 1 }), NOW)).toBeNull();
  });

  it('respekterer en aftalt opfølgning frem i tiden', () => {
    expect(
      skipReason(lead({ next_follow_up_at: '2026-09-09T10:00:00Z' }), NOW),
    ).toBe('scheduled_later');
  });

  it('tillader et lead hvis opfølgningen er forfalden', () => {
    expect(skipReason(lead({ next_follow_up_at: '2026-09-07T10:00:00Z' }), NOW)).toBeNull();
  });

  it('ringer ikke igen inden for en time', () => {
    expect(skipReason(lead({ last_call_at: '2026-09-08T09:30:00Z' }), NOW)).toBe('too_soon');
    expect(skipReason(lead({ last_call_at: '2026-09-08T08:30:00Z' }), NOW)).toBeNull();
  });

  it('isCallable følger skipReason', () => {
    expect(isCallable(lead(), NOW)).toBe(true);
    expect(isCallable(lead({ do_not_call: true }), NOW)).toBe(false);
  });
});

describe('sortQueue', () => {
  it('tager forfaldne opfølgninger først', () => {
    const followUp = lead({ company_name: 'Lovet tilbagekald', next_follow_up_at: '2026-09-08T08:00:00Z', call_attempts: 3 });
    const fresh = lead({ company_name: 'Aldrig ringet' });

    const order = sortQueue([fresh, followUp], NOW).map((l) => l.company_name);
    expect(order).toEqual(['Lovet tilbagekald', 'Aldrig ringet']);
  });

  it('tager den ældste aftale først blandt forfaldne', () => {
    const older = lead({ company_name: 'Ældst', next_follow_up_at: '2026-09-08T06:00:00Z' });
    const newer = lead({ company_name: 'Nyere', next_follow_up_at: '2026-09-08T09:00:00Z' });

    expect(sortQueue([newer, older], NOW).map((l) => l.company_name)).toEqual(['Ældst', 'Nyere']);
  });

  it('tager færrest forsøg først', () => {
    const many = lead({ company_name: 'Mange forsøg', call_attempts: 5 });
    const few = lead({ company_name: 'Få forsøg', call_attempts: 1 });

    expect(sortQueue([many, few], NOW).map((l) => l.company_name)).toEqual([
      'Få forsøg',
      'Mange forsøg',
    ]);
  });

  it('tager det ældste forsøg først ved samme antal forsøg', () => {
    const recent = lead({ company_name: 'Nyligt', call_attempts: 2, last_call_at: '2026-09-08T07:00:00Z' });
    const old = lead({ company_name: 'Gammelt', call_attempts: 2, last_call_at: '2026-09-01T07:00:00Z' });

    expect(sortQueue([recent, old], NOW).map((l) => l.company_name)).toEqual([
      'Gammelt',
      'Nyligt',
    ]);
  });

  it('ændrer ikke det oprindelige array', () => {
    const input = [lead({ call_attempts: 5 }), lead({ call_attempts: 1 })];
    const before = input.map((l) => l.call_attempts);
    sortQueue(input, NOW);
    expect(input.map((l) => l.call_attempts)).toEqual(before);
  });
});

describe('buildQueue', () => {
  it('filtrerer og sorterer i ét hug', () => {
    const queue = buildQueue(
      [
        lead({ company_name: 'Må ikke kontaktes', do_not_call: true }),
        lead({ company_name: 'Vundet', status: 'won' }),
        lead({ company_name: 'Klar', call_attempts: 2 }),
        lead({ company_name: 'Forfalden opfølgning', next_follow_up_at: '2026-09-08T07:00:00Z' }),
      ],
      NOW,
    );

    expect(queue.map((l) => l.company_name)).toEqual(['Forfalden opfølgning', 'Klar']);
  });
});

describe('withinCallingHours', () => {
  it('er sand på en hverdag midt på dagen', () => {
    expect(withinCallingHours(new Date('2026-09-08T10:00:00Z'))).toBe(true);
  });

  it('er falsk om aftenen', () => {
    expect(withinCallingHours(new Date('2026-09-08T19:00:00Z'))).toBe(false);
  });

  it('er falsk i weekenden', () => {
    expect(withinCallingHours(new Date('2026-09-05T10:00:00Z'))).toBe(false); // lørdag
    expect(withinCallingHours(new Date('2026-09-06T10:00:00Z'))).toBe(false); // søndag
  });

  it('regner i dansk tid, ikke UTC', () => {
    // 06:30 UTC er 08:30 dansk sommertid - inden for ringetid.
    expect(withinCallingHours(new Date('2026-09-08T06:30:00Z'))).toBe(true);
    // 05:30 UTC er 07:30 dansk tid - for tidligt.
    expect(withinCallingHours(new Date('2026-09-08T05:30:00Z'))).toBe(false);
  });
});

describe('clampLines', () => {
  it('holder sig inden for det tilladte antal linjer', () => {
    expect(clampLines(1)).toBe(1);
    expect(clampLines(3)).toBe(3);
    expect(clampLines(99)).toBe(4);
    expect(clampLines(0)).toBe(1);
    expect(clampLines(-5)).toBe(1);
    expect(clampLines(2.7)).toBe(2);
    expect(clampLines(Number.NaN)).toBe(1);
  });
});
