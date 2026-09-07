'use client';

import Link from 'next/link';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Info } from 'lucide-react';

import { importLeads } from '../actions';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { buildLeads, guessMapping, LEAD_FIELDS, type LeadField } from '@/lib/csv';
import { formatPhone } from '@/lib/utils';

type Row = Record<string, string>;

export default function ImportPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [fileName, setFileName] = useState('');
  const [listName, setListName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, LeadField | ''>>({});
  const [parseError, setParseError] = useState<string>('');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const preview = useMemo(
    () => (rows.length ? buildLeads(rows, mapping) : null),
    [rows, mapping],
  );

  function handleFile(file: File) {
    setParseError('');
    setResult(null);
    setFileName(file.name);
    setListName((current) => current || file.name.replace(/\.csv$/i, ''));

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // Lader Papa gætte separatoren: danske eksporter bruger ofte semikolon.
      delimiter: '',
      complete: (parsed) => {
        const fields = (parsed.meta.fields ?? []).filter(Boolean);
        if (!fields.length) {
          setParseError('Filen har ingen kolonneoverskrifter.');
          return;
        }
        setHeaders(fields);
        setRows(parsed.data.filter((row) => Object.values(row).some((v) => v?.trim())));
        setMapping(guessMapping(fields));
      },
      error: (err) => setParseError(`Kunne ikke læse filen: ${err.message}`),
    });
  }

  function handleImport() {
    if (!preview?.valid.length) return;

    startTransition(async () => {
      const response = await importLeads(listName, preview.valid);
      if (response.error) {
        setParseError(response.error);
        return;
      }
      setResult({
        imported: response.imported ?? 0,
        skipped: response.skippedExisting ?? 0,
      });
      router.refresh();
    });
  }

  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const missingCompany = headers.length > 0 && !mappedFields.has('company_name');
  const missingPhone =
    headers.length > 0 && !mappedFields.has('phone') && !mappedFields.has('mobile');

  return (
    <>
      <PageHeader
        title="Importér leads"
        description="Læs en CSV-fil ind, tjek at kolonnerne passer, og gem listen."
        action={
          <Link href="/leads">
            <Button variant="secondary">Tilbage til leads</Button>
          </Link>
        }
      />

      {result ? (
        // Blev intet importeret fordi alt fandtes i forvejen, er der ikke sket
        // noget galt - men et grønt flueben ved "0 leads" læses som en fejl.
        // Derfor to forskellige beskeder.
        result.imported === 0 && result.skipped > 0 ? (
          <Card className="mb-6 border-sky-200 bg-sky-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
              <div>
                <p className="text-sm font-medium text-sky-900">
                  Alle {result.skipped} leads i filen findes allerede
                </p>
                <p className="mt-0.5 text-sm text-sky-800">
                  Der er derfor ikke oprettet nogen ny liste, og intet er ændret. Er filen
                  importeret før, ligger leadsene allerede under Leads.
                </p>
                <Link
                  href="/leads"
                  className="mt-2 inline-block text-sm font-medium text-sky-900 underline"
                >
                  Se dine leads
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="mb-6 border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <p className="text-sm font-medium text-emerald-900">
                  {result.imported} leads importeret
                </p>
                {result.skipped > 0 ? (
                  <p className="mt-0.5 text-sm text-emerald-800">
                    {result.skipped} blev sprunget over, fordi nummeret allerede fandtes.
                  </p>
                ) : null}
                <Link
                  href="/leads"
                  className="mt-2 inline-block text-sm font-medium text-emerald-900 underline"
                >
                  Se leads
                </Link>
              </div>
            </div>
          </Card>
        )
      ) : null}

      <Card className="mb-6">
        <CardHeader title="1. Vælg fil" description="CSV med komma eller semikolon som separator." />
        <div className="p-4">
          <label
            htmlFor="csv"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-brand-400 hover:bg-brand-50/40"
          >
            <FileUp className="h-6 w-6 text-slate-400" aria-hidden />
            <span className="text-sm font-medium text-slate-700">
              {fileName || 'Vælg en CSV-fil'}
            </span>
            <span className="text-xs text-slate-500">
              Kolonner som Virksomhed, Telefon og Kontaktperson genkendes automatisk.
            </span>
          </label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </Card>

      {parseError ? (
        <p role="alert" className="mb-6 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {parseError}
        </p>
      ) : null}

      {headers.length > 0 ? (
        <>
          <Card className="mb-6">
            <CardHeader
              title="2. Tjek kolonnerne"
              description={`${rows.length} rækker læst fra filen.`}
            />
            <div className="divide-y divide-slate-100">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-4 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{header}</p>
                    <p className="truncate text-xs text-slate-500">
                      {rows[0]?.[header]?.trim() || 'tom'}
                    </p>
                  </div>
                  <Select
                    aria-label={`Felt for kolonnen ${header}`}
                    value={mapping[header] ?? ''}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [header]: event.target.value as LeadField | '',
                      }))
                    }
                    className="w-52"
                  >
                    <option value="">Importér ikke</option>
                    {(Object.keys(LEAD_FIELDS) as LeadField[]).map((field) => (
                      <option
                        key={field}
                        value={field}
                        disabled={mapping[header] !== field && mappedFields.has(field)}
                      >
                        {LEAD_FIELDS[field].label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {missingCompany || missingPhone ? (
              <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <p className="text-sm text-amber-800">
                  {missingCompany ? 'Vælg hvilken kolonne der indeholder virksomhedsnavnet. ' : ''}
                  {missingPhone ? 'Vælg en kolonne med telefon- eller mobilnummer.' : ''}
                </p>
              </div>
            ) : null}
          </Card>

          {preview ? (
            <Card className="mb-6">
              <CardHeader
                title="3. Gennemse"
                description={`${preview.valid.length} klar til import · ${preview.errors.length} med fejl · ${preview.duplicatesInFile} dubletter i filen`}
              />

              {preview.valid.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Virksomhed</th>
                        <th className="px-4 py-2 font-medium">Kontakt</th>
                        <th className="px-4 py-2 font-medium">Telefon</th>
                        <th className="px-4 py-2 font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.valid.slice(0, 5).map((lead, index) => (
                        <tr key={`${lead.phone}-${index}`}>
                          <td className="px-4 py-2 text-slate-900">{lead.company_name}</td>
                          <td className="px-4 py-2 text-slate-600">{lead.contact_name ?? '–'}</td>
                          <td className="tabular px-4 py-2 text-slate-600">
                            {formatPhone(lead.phone)}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{lead.city ?? '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.valid.length > 5 ? (
                    <p className="px-4 py-2 text-xs text-slate-500">
                      … og {preview.valid.length - 5} mere.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  Ingen rækker kan importeres endnu.
                </p>
              )}

              {preview.errors.length > 0 ? (
                <div className="border-t border-slate-200 px-4 py-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Rækker der springes over
                  </p>
                  <ul className="space-y-0.5 text-sm text-slate-600">
                    {preview.errors.slice(0, 8).map((err) => (
                      <li key={err.row}>
                        Række {err.row}: {err.error}
                      </li>
                    ))}
                    {preview.errors.length > 8 ? (
                      <li className="text-slate-500">
                        … og {preview.errors.length - 8} mere.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 flex-1 space-y-1.5">
                <Label htmlFor="list-name">Listenavn</Label>
                <Input
                  id="list-name"
                  value={listName}
                  onChange={(event) => setListName(event.target.value)}
                  placeholder="Fx Byggebranchen Jylland"
                />
              </div>
              <Button
                size="lg"
                onClick={handleImport}
                disabled={pending || !preview?.valid.length}
              >
                {pending
                  ? 'Importerer…'
                  : `Importér ${preview?.valid.length ?? 0} leads`}
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
