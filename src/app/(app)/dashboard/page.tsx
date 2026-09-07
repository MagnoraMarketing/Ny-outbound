import Link from 'next/link';
import { CalendarClock, PhoneCall, Target, TrendingUp } from 'lucide-react';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LEAD_STATUS_LABELS, LEAD_STATUS_STYLES } from '@/lib/constants';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function startOfToday(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export default async function DashboardPage() {
  const { profile } = await requireSession();
  const supabase = await createClient();
  const since = startOfToday();

  const [callsToday, meetingsToday, openTasks, recentCalls, pipeline] = await Promise.all([
    supabase
      .from('calls')
      .select('id, status, talk_seconds', { count: 'exact' })
      .gte('created_at', since),
    supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    supabase
      .from('tasks')
      .select('id, title, due_at, lead_id, leads(company_name)')
      .eq('status', 'open')
      .order('due_at', { ascending: true })
      .limit(6),
    supabase
      .from('calls')
      .select('id, status, to_number, created_at, talk_seconds, leads(id, company_name)')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('leads').select('status'),
  ]);

  const calls = callsToday.data ?? [];
  const connected = calls.filter((c) => c.status === 'answered' || c.status === 'completed');
  const talkSeconds = calls.reduce((sum, c) => sum + (c.talk_seconds ?? 0), 0);
  const connectRate = calls.length ? Math.round((connected.length / calls.length) * 100) : 0;

  const pipelineCounts = (pipeline.data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    {
      label: 'Opkald i dag',
      value: String(callsToday.count ?? calls.length),
      icon: PhoneCall,
    },
    { label: 'Kontaktprocent', value: `${connectRate} %`, icon: Target },
    { label: 'Taletid', value: formatDuration(talkSeconds), icon: TrendingUp },
    { label: 'Møder booket i dag', value: String(meetingsToday.count ?? 0), icon: CalendarClock },
  ];

  return (
    <>
      <PageHeader
        title={`Godmorgen, ${profile.full_name?.split(' ')[0] ?? 'sælger'}`}
        description="Dagens tal og det der venter på dig."
        action={
          <Link href="/dialer">
            <Button size="lg">Start ringesession</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <Icon className="h-4 w-4 text-slate-400" aria-hidden />
            </div>
            <p className="tabular mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Seneste opkald"
            action={
              <Link href="/opkald" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Se alle
              </Link>
            }
          />
          {recentCalls.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {recentCalls.data.map((call) => (
                <li key={call.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/opkald/${call.id}`}
                      className="truncate text-sm font-medium text-slate-900 hover:text-brand-700"
                    >
                      {call.leads?.company_name ?? call.to_number ?? 'Ukendt'}
                    </Link>
                    <p className="text-xs text-slate-500">{formatDateTime(call.created_at)}</p>
                  </div>
                  <span className="tabular shrink-0 text-xs text-slate-500">
                    {formatDuration(call.talk_seconds)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Ingen opkald endnu. Importér leads og start en ringesession.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Pipeline" />
            <ul className="divide-y divide-slate-100">
              {(Object.keys(LEAD_STATUS_LABELS) as (keyof typeof LEAD_STATUS_LABELS)[]).map(
                (status) => (
                  <li key={status} className="flex items-center justify-between px-4 py-2">
                    <Badge className={cn(LEAD_STATUS_STYLES[status])}>
                      {LEAD_STATUS_LABELS[status]}
                    </Badge>
                    <span className="tabular text-sm text-slate-600">
                      {pipelineCounts[status] ?? 0}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Næste opfølgninger" />
            {openTasks.data?.length ? (
              <ul className="divide-y divide-slate-100">
                {openTasks.data.map((task) => (
                  <li key={task.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      {task.leads?.company_name ? `${task.leads.company_name} · ` : ''}
                      {formatDateTime(task.due_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Ingen åbne opfølgninger.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
