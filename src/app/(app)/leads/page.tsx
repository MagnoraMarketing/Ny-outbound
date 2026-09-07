import Link from 'next/link';
import { Upload } from 'lucide-react';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LEAD_STATUS_LABELS, LEAD_STATUS_STYLES } from '@/lib/constants';
import type { LeadStatus } from '@/lib/supabase/database.types';
import { cn, formatDateTime, formatPhone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  status?: string;
  liste?: string;
  side?: string;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireSession();
  const params = await searchParams;
  const supabase = await createClient();

  const page = Math.max(1, Number.parseInt(params.side ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('leads')
    .select('id, company_name, contact_name, phone, city, status, last_call_at, call_attempts', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.status && params.status in LEAD_STATUS_LABELS) {
    query = query.eq('status', params.status as LeadStatus);
  }

  if (params.liste) {
    query = query.eq('list_id', params.liste);
  }

  if (params.q) {
    // Fritekst over de felter en sælger typisk søger på.
    const term = params.q.replace(/[%,()]/g, ' ').trim();
    if (term) {
      query = query.or(
        `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,phone.ilike.%${term}%`,
      );
    }
  }

  const [{ data: leads, count, error }, { data: lists }] = await Promise.all([
    query,
    supabase.from('lead_lists').select('id, name').order('created_at', { ascending: false }),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const buildHref = (overrides: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/leads?${qs}` : '/leads';
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          count != null ? `${count.toLocaleString('da-DK')} leads i alt` : 'Dine leads'
        }
        action={
          <Link href="/leads/import">
            <Button>
              <Upload className="h-4 w-4" aria-hidden />
              Importér CSV
            </Button>
          </Link>
        }
      />

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3" action="/leads">
          <div className="min-w-52 flex-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">
              Søg
            </label>
            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Firma, kontakt eller nummer"
              className="block w-full rounded-md border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            />
          </div>

          <div>
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-slate-600">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={params.status ?? ''}
              className="block rounded-md border-0 py-2 pl-3 pr-8 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            >
              <option value="">Alle</option>
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="liste" className="mb-1 block text-xs font-medium text-slate-600">
              Liste
            </label>
            <select
              id="liste"
              name="liste"
              defaultValue={params.liste ?? ''}
              className="block rounded-md border-0 py-2 pl-3 pr-8 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            >
              <option value="">Alle lister</option>
              {(lists ?? []).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrér
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <p className="px-4 py-8 text-center text-sm text-rose-600">
            Kunne ikke hente leads: {error.message}
          </p>
        ) : leads?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Virksomhed</th>
                  <th className="px-4 py-2.5 font-medium">Kontakt</th>
                  <th className="px-4 py-2.5 font-medium">Telefon</th>
                  <th className="px-4 py-2.5 font-medium">By</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Forsøg</th>
                  <th className="px-4 py-2.5 font-medium">Sidste opkald</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {lead.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{lead.contact_name ?? '–'}</td>
                    <td className="tabular px-4 py-2.5 text-slate-600">
                      {formatPhone(lead.phone)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{lead.city ?? '–'}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={cn(LEAD_STATUS_STYLES[lead.status])}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-2.5 text-slate-600">{lead.call_attempts}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatDateTime(lead.last_call_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-600">Ingen leads matcher filteret.</p>
            <Link href="/leads/import" className="mt-2 inline-block text-sm text-brand-600 underline">
              Importér din første liste
            </Link>
          </div>
        )}
      </Card>

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Sider">
          <span className="text-slate-500">
            Side {page} af {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={buildHref({ side: String(page - 1) })}>
                <Button variant="secondary" size="sm">
                  Forrige
                </Button>
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={buildHref({ side: String(page + 1) })}>
                <Button variant="secondary" size="sm">
                  Næste
                </Button>
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
