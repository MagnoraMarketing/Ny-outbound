import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  PhoneCall,
  Sparkles,
  User,
} from 'lucide-react';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { LeadActions } from '@/components/leads/lead-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CALL_STATUS_LABELS, LEAD_STATUS_LABELS, LEAD_STATUS_STYLES } from '@/lib/constants';
import { cn, formatDateTime, formatDuration, formatPhone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single();

  if (!lead) notFound();

  const [{ data: activities }, { data: calls }, { data: tasks }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, type, title, body, created_at, profiles(full_name)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('calls')
      .select('id, status, created_at, talk_seconds, dispositions(name), call_ai_analysis(summary)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('tasks')
      .select('id, title, due_at, status')
      .eq('lead_id', id)
      .eq('status', 'open')
      .order('due_at', { ascending: true }),
  ]);

  const details = [
    { icon: User, label: 'Kontakt', value: lead.contact_name, extra: lead.title },
    { icon: PhoneCall, label: 'Telefon', value: formatPhone(lead.phone) },
    { icon: PhoneCall, label: 'Mobil', value: formatPhone(lead.mobile) },
    { icon: Mail, label: 'E-mail', value: lead.email },
    { icon: Globe, label: 'Hjemmeside', value: lead.website },
    {
      icon: MapPin,
      label: 'Adresse',
      value: [lead.address, [lead.postal_code, lead.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
    },
    { icon: Building2, label: 'Branche', value: lead.industry },
    { icon: Building2, label: 'CVR', value: lead.cvr },
  ].filter((item) => item.value);

  return (
    <>
      <PageHeader
        title={lead.company_name}
        description={[lead.city, lead.industry].filter(Boolean).join(' · ') || undefined}
        action={
          <>
            <Badge className={cn(LEAD_STATUS_STYLES[lead.status])}>
              {LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            {lead.phone && !lead.do_not_call ? (
              <Link href={`/dialer?lead=${lead.id}`}>
                <Button>
                  <PhoneCall className="h-4 w-4" aria-hidden />
                  Ring op
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      {lead.do_not_call ? (
        <p className="mb-6 rounded-md bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100">
          Dette lead er markeret som &quot;må ikke kontaktes&quot; og kan ikke ringes op.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Stamdata" />
            <dl className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2">
              {details.map(({ icon: Icon, label, value, extra }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="truncate text-sm text-slate-900">
                      {value}
                      {extra ? <span className="text-slate-500"> · {extra}</span> : null}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Opkald" description={`${lead.call_attempts} forsøg i alt`} />
            {calls?.length ? (
              <ul className="divide-y divide-slate-100">
                {calls.map((call) => {
                  // Omvendt relation, så PostgREST returnerer en liste.
                  // Et opkald har hoejst en analyse (unikt indeks paa call_id).
                  const analysis = call.call_ai_analysis?.[0];
                  return (
                  <li key={call.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <Link
                        href={`/opkald/${call.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-brand-700"
                      >
                        {CALL_STATUS_LABELS[call.status]}
                        {call.dispositions?.name ? ` · ${call.dispositions.name}` : ''}
                      </Link>
                      <span className="tabular shrink-0 text-xs text-slate-500">
                        {formatDuration(call.talk_seconds)} · {formatDateTime(call.created_at)}
                      </span>
                    </div>
                    {analysis?.summary ? (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" aria-hidden />
                        {analysis.summary}
                      </p>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Der er ikke ringet til dette lead endnu.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Tidslinje" />
            {activities?.length ? (
              <ol className="divide-y divide-slate-100">
                {activities.map((activity) => (
                  <li key={activity.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatDateTime(activity.created_at)}
                      </span>
                    </div>
                    {activity.body ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">
                        {activity.body}
                      </p>
                    ) : null}
                    {activity.profiles?.full_name ? (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {activity.profiles.full_name}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Ingen aktivitet endnu.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Handlinger" />
            <div className="p-4">
              <LeadActions leadId={lead.id} status={lead.status} />
            </div>
          </Card>

          {tasks?.length ? (
            <Card>
              <CardHeader title="Åbne opfølgninger" />
              <ul className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <li key={task.id} className="px-4 py-2.5">
                    <p className="text-sm text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(task.due_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {lead.notes ? (
            <Card>
              <CardHeader title="Noter fra import" />
              <p className="whitespace-pre-wrap px-4 py-3 text-sm text-slate-600">{lead.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
