import Link from 'next/link';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CALL_STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, formatDuration, formatPhone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CallsPage() {
  await requireSession();
  const supabase = await createClient();

  const { data: calls } = await supabase
    .from('calls')
    .select(
      'id, status, to_number, created_at, talk_seconds, leads(id, company_name), dispositions(name), profiles(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Opkald" description="De seneste 100 opkald i organisationen." />

      <Card className="overflow-hidden">
        {calls?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Virksomhed</th>
                  <th className="px-4 py-2.5 font-medium">Nummer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Udfald</th>
                  <th className="px-4 py-2.5 font-medium">Taletid</th>
                  <th className="px-4 py-2.5 font-medium">Sælger</th>
                  <th className="px-4 py-2.5 font-medium">Tidspunkt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/opkald/${call.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {call.leads?.company_name ?? 'Ukendt'}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-2.5 text-slate-600">
                      {formatPhone(call.to_number)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge>{CALL_STATUS_LABELS[call.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {call.dispositions?.name ?? '–'}
                    </td>
                    <td className="tabular px-4 py-2.5 text-slate-600">
                      {formatDuration(call.talk_seconds)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {call.profiles?.full_name ?? '–'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatDateTime(call.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            Der er ikke registreret nogen opkald endnu.
          </p>
        )}
      </Card>
    </>
  );
}
