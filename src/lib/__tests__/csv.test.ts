import { describe, expect, it } from 'vitest';

import { buildLeads, guessMapping, type LeadField } from '@/lib/csv';

describe('guessMapping', () => {
  it('genkender typiske danske kolonnenavne', () => {
    const mapping = guessMapping([
      'Virksomhed',
      'CVR-nr.',
      'Kontaktperson',
      'Telefon',
      'E-mail',
      'Postnr',
      'By',
    ]);

    expect(mapping['Virksomhed']).toBe('company_name');
    expect(mapping['CVR-nr.']).toBe('cvr');
    expect(mapping['Kontaktperson']).toBe('contact_name');
    expect(mapping['Telefon']).toBe('phone');
    expect(mapping['E-mail']).toBe('email');
    expect(mapping['Postnr']).toBe('postal_code');
    expect(mapping['By']).toBe('city');
  });

  it('genkender engelske kolonnenavne', () => {
    const mapping = guessMapping(['Company Name', 'Phone Number', 'Email', 'City']);
    expect(mapping['Company Name']).toBe('company_name');
    expect(mapping['Phone Number']).toBe('phone');
    expect(mapping['Email']).toBe('email');
    expect(mapping['City']).toBe('city');
  });

  it('holder telefon og mobil adskilt', () => {
    const mapping = guessMapping(['Firma', 'Telefon', 'Mobil']);
    expect(mapping['Telefon']).toBe('phone');
    expect(mapping['Mobil']).toBe('mobile');
  });

  it('tildeler aldrig det samme felt to gange', () => {
    const mapping = guessMapping(['Firma', 'Virksomhedsnavn', 'Selskab']);
    const assigned = Object.values(mapping).filter((f): f is LeadField => f !== '');
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('lader ukendte kolonner stå tomme', () => {
    const mapping = guessMapping(['Firma', 'Tilfældig kolonne 42']);
    expect(mapping['Tilfældig kolonne 42']).toBe('');
  });
});

describe('buildLeads', () => {
  const mapping = guessMapping(['Virksomhed', 'Telefon', 'Mobil', 'E-mail', 'Hjemmeside', 'Ansatte', 'CVR']);

  it('bygger et lead og normaliserer felterne', () => {
    const result = buildLeads(
      [
        {
          Virksomhed: 'Testfirma ApS',
          Telefon: '12 34 56 78',
          Mobil: '',
          'E-mail': ' Kontakt@Testfirma.DK ',
          Hjemmeside: 'testfirma.dk/',
          Ansatte: 'ca. 25',
          CVR: 'DK 12 34 56 78',
        },
      ],
      mapping,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      company_name: 'Testfirma ApS',
      phone: '+4512345678',
      email: 'kontakt@testfirma.dk',
      website: 'https://testfirma.dk',
      employees: 25,
      cvr: '12345678',
    });
  });

  it('afviser rækker uden firmanavn', () => {
    const result = buildLeads([{ Virksomhed: '  ', Telefon: '12345678' }], mapping);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0]).toEqual({ row: 1, error: 'Mangler virksomhedsnavn' });
  });

  it('afviser rækker uden brugbart nummer', () => {
    const result = buildLeads([{ Virksomhed: 'Uden nummer ApS', Telefon: 'ring til os' }], mapping);
    expect(result.valid).toHaveLength(0);
    expect(result.errors[0].error).toBe('Mangler et brugbart telefonnummer');
  });

  it('bruger mobilnummeret når fastnet mangler', () => {
    const result = buildLeads([{ Virksomhed: 'Kun mobil ApS', Telefon: '', Mobil: '20304050' }], mapping);
    expect(result.valid[0].phone).toBe('+4520304050');
    // Samme nummer skal ikke stå begge steder
    expect(result.valid[0].mobile).toBeNull();
  });

  it('beholder mobil som ekstra nummer når det afviger', () => {
    const result = buildLeads(
      [{ Virksomhed: 'Begge ApS', Telefon: '12345678', Mobil: '20304050' }],
      mapping,
    );
    expect(result.valid[0].phone).toBe('+4512345678');
    expect(result.valid[0].mobile).toBe('+4520304050');
  });

  it('fjerner dubletter inden for filen', () => {
    const result = buildLeads(
      [
        { Virksomhed: 'Firma A', Telefon: '12345678' },
        { Virksomhed: 'Firma A igen', Telefon: '12 34 56 78' },
        { Virksomhed: 'Firma B', Telefon: '87654321' },
      ],
      mapping,
    );
    expect(result.valid).toHaveLength(2);
    expect(result.duplicatesInFile).toBe(1);
  });

  it('rapporterer rækkenummer så fejl kan findes i filen', () => {
    const result = buildLeads(
      [
        { Virksomhed: 'God ApS', Telefon: '12345678' },
        { Virksomhed: '', Telefon: '87654321' },
      ],
      mapping,
    );
    expect(result.errors[0].row).toBe(2);
  });

  it('dropper ugyldige e-mails i stedet for at afvise leadet', () => {
    const result = buildLeads(
      [{ Virksomhed: 'Firma', Telefon: '12345678', 'E-mail': 'ikke-en-mail' }],
      mapping,
    );
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].email).toBeNull();
  });
});
