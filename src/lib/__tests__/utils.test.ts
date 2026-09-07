import { describe, expect, it } from 'vitest';

import { formatDuration, formatPhone, normalizeCvr, normalizePhone } from '@/lib/utils';

describe('normalizePhone', () => {
  it('antager dansk landekode ved otte cifre', () => {
    expect(normalizePhone('12345678')).toBe('+4512345678');
  });

  it('fjerner formatering som sælgere typisk indsætter fra regneark', () => {
    expect(normalizePhone('12 34 56 78')).toBe('+4512345678');
    expect(normalizePhone('12-34-56-78')).toBe('+4512345678');
    expect(normalizePhone('(+45) 12 34 56 78')).toBe('+4512345678');
    expect(normalizePhone(' 12345678 ')).toBe('+4512345678');
  });

  it('forstår 00 som internationalt præfiks', () => {
    expect(normalizePhone('0045 12345678')).toBe('+4512345678');
    expect(normalizePhone('004712345678')).toBe('+4712345678');
  });

  it('bevarer udenlandske numre', () => {
    expect(normalizePhone('+46701234567')).toBe('+46701234567');
    expect(normalizePhone('4512345678')).toBe('+4512345678');
  });

  it('afviser det der ikke kan være et nummer', () => {
    expect(normalizePhone('1234')).toBeNull();
    expect(normalizePhone('ikke et nummer')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('+1234567890123456789')).toBeNull();
  });
});

describe('formatPhone', () => {
  it('grupperer danske numre parvis', () => {
    expect(formatPhone('+4512345678')).toBe('+45 12 34 56 78');
  });

  it('lader udenlandske numre stå', () => {
    expect(formatPhone('+46701234567')).toBe('+46701234567');
    expect(formatPhone(null)).toBe('');
  });
});

describe('normalizeCvr', () => {
  it('accepterer otte cifre med og uden mellemrum', () => {
    expect(normalizeCvr('12345678')).toBe('12345678');
    expect(normalizeCvr('DK 12 34 56 78')).toBe('12345678');
  });

  it('afviser forkert længde', () => {
    expect(normalizeCvr('1234567')).toBeNull();
    expect(normalizeCvr(null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('viser minutter og sekunder', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3600)).toBe('60:00');
    expect(formatDuration(null)).toBe('–');
  });
});
