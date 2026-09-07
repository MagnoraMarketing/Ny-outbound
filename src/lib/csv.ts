import { normalizeCvr, normalizePhone } from '@/lib/utils';

/** De felter på et lead som en CSV-kolonne kan mappes til. */
export const LEAD_FIELDS = {
  company_name: { label: 'Virksomhed', required: true },
  cvr: { label: 'CVR-nummer', required: false },
  contact_name: { label: 'Kontaktperson', required: false },
  title: { label: 'Titel', required: false },
  phone: { label: 'Telefon', required: false },
  mobile: { label: 'Mobil', required: false },
  email: { label: 'E-mail', required: false },
  website: { label: 'Hjemmeside', required: false },
  address: { label: 'Adresse', required: false },
  postal_code: { label: 'Postnummer', required: false },
  city: { label: 'By', required: false },
  industry: { label: 'Branche', required: false },
  employees: { label: 'Antal ansatte', required: false },
  notes: { label: 'Noter', required: false },
} as const;

export type LeadField = keyof typeof LEAD_FIELDS;

/**
 * Kolonnenavne vi genkender automatisk. Danske betegnelser først, da det er
 * dem der kommer ud af Bisnode, Proff, NN Markedsdata og lignende kilder.
 */
const ALIASES: Record<LeadField, string[]> = {
  company_name: ['virksomhed', 'virksomhedsnavn', 'firma', 'firmanavn', 'selskab', 'navn', 'company', 'companyname', 'organisation', 'kunde'],
  cvr: ['cvr', 'cvrnummer', 'cvrnr', 'vat', 'vatnumber', 'momsnummer'],
  contact_name: ['kontakt', 'kontaktperson', 'kontaktnavn', 'person', 'fuldenavn', 'contact', 'contactname', 'attention', 'att'],
  title: ['titel', 'stilling', 'jobtitel', 'rolle', 'title', 'jobtitle', 'position'],
  phone: ['telefon', 'telefonnummer', 'tlf', 'tlfnr', 'hovednummer', 'phone', 'phonenumber', 'telephone'],
  mobile: ['mobil', 'mobilnummer', 'mobiltelefon', 'mobile', 'cell'],
  email: ['email', 'epost', 'mail', 'mailadresse', 'emailadresse'],
  website: ['hjemmeside', 'web', 'website', 'url', 'domæne', 'domaene', 'domain'],
  address: ['adresse', 'vej', 'gade', 'address', 'street', 'adresselinje'],
  postal_code: ['postnr', 'postnummer', 'postalcode', 'zip', 'zipcode'],
  city: ['by', 'bynavn', 'city', 'town'],
  industry: ['branche', 'branchekode', 'industri', 'industry', 'sektor'],
  employees: ['ansatte', 'antalansatte', 'medarbejdere', 'employees', 'headcount'],
  notes: ['noter', 'note', 'bemærkning', 'bemaerkning', 'kommentar', 'notes', 'comment'],
};

/** Gør et kolonnenavn sammenligneligt: små bogstaver, kun bogstaver og tal. */
function canonical(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // fjerner accenter efter NFD-opdeling
    .replace(/[^a-z0-9\u00e6\u00f8]/g, ''); // æ og ø opdeles ikke af NFD
}

/**
 * Gætter hvilket lead-felt hver CSV-kolonne hører til.
 * Hvert felt kan kun tildeles én gang - første kolonne der matcher vinder.
 */
export function guessMapping(headers: string[]): Record<string, LeadField | ''> {
  const mapping: Record<string, LeadField | ''> = {};
  const taken = new Set<LeadField>();

  // Eksakte match først, så "telefon" ikke stjæler pladsen fra "mobil"
  // fordi den tilfældigvis stod først.
  for (const pass of ['exact', 'partial'] as const) {
    for (const header of headers) {
      if (mapping[header]) continue;
      const key = canonical(header);
      if (!key) continue;

      for (const [field, aliases] of Object.entries(ALIASES) as [LeadField, string[]][]) {
        if (taken.has(field)) continue;

        const hit =
          pass === 'exact'
            ? aliases.includes(key)
            : aliases.some((alias) => key.includes(alias) || alias.includes(key));

        if (hit) {
          mapping[header] = field;
          taken.add(field);
          break;
        }
      }
    }
  }

  for (const header of headers) {
    if (!mapping[header]) mapping[header] = '';
  }

  return mapping;
}

export interface ParsedLead {
  company_name: string;
  cvr: string | null;
  contact_name: string | null;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
  employees: number | null;
  notes: string | null;
}

export interface RowResult {
  /** Rækkenummer i filen, 1-indekseret uden header. */
  row: number;
  lead?: ParsedLead;
  error?: string;
}

export interface ImportPreview {
  valid: ParsedLead[];
  errors: RowResult[];
  /** Rækker droppet fordi telefonnummeret gik igen inde i selve filen. */
  duplicatesInFile: number;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  // Bevidst løs validering: vi afviser kun det der tydeligt ikke er en adresse.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function parseEmployees(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Oversætter rå CSV-rækker til leads ud fra kolonnemappingen.
 *
 * Et lead skal have et firmanavn og mindst ét telefonnummer - uden nummer kan
 * der ikke ringes, og så hører rækken ikke hjemme i en dialer.
 */
export function buildLeads(
  rows: Record<string, string>[],
  mapping: Record<string, LeadField | ''>,
): ImportPreview {
  const valid: ParsedLead[] = [];
  const errors: RowResult[] = [];
  const seenPhones = new Set<string>();
  let duplicatesInFile = 0;

  const columnFor = (field: LeadField): string | undefined =>
    Object.keys(mapping).find((header) => mapping[header] === field);

  const columns = Object.fromEntries(
    (Object.keys(LEAD_FIELDS) as LeadField[]).map((field) => [field, columnFor(field)]),
  ) as Record<LeadField, string | undefined>;

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const get = (field: LeadField): string | null => {
      const column = columns[field];
      return column ? text(row[column]) : null;
    };

    const companyName = get('company_name');
    if (!companyName) {
      errors.push({ row: rowNumber, error: 'Mangler virksomhedsnavn' });
      return;
    }

    const phone = normalizePhone(get('phone'));
    const mobile = normalizePhone(get('mobile'));

    if (!phone && !mobile) {
      errors.push({ row: rowNumber, error: 'Mangler et brugbart telefonnummer' });
      return;
    }

    // Nummeret der ringes til er primærnøglen i dialeren.
    const primary = phone ?? mobile!;
    if (seenPhones.has(primary)) {
      duplicatesInFile += 1;
      return;
    }
    seenPhones.add(primary);

    valid.push({
      company_name: companyName,
      cvr: normalizeCvr(get('cvr')),
      contact_name: get('contact_name'),
      title: get('title'),
      phone: primary,
      mobile: mobile && mobile !== primary ? mobile : null,
      email: normalizeEmail(get('email')),
      website: normalizeWebsite(get('website')),
      address: get('address'),
      postal_code: get('postal_code'),
      city: get('city'),
      industry: get('industry'),
      employees: parseEmployees(get('employees')),
      notes: get('notes'),
    });
  });

  return { valid, errors, duplicatesInFile };
}
