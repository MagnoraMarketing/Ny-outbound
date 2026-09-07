import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sparkles, TrendingUp } from 'lucide-react';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { AnalyzeButton } from '@/components/calls/analyze-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { CALL_STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, formatDuration, formatPhone } from '@/lib/utils';
import type { Coaching, Objection } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const SENTIMENT_STYLES: Record<string, string> = {
  positiv: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  negativ: 'bg-rose-100 text-rose-800 ring-rose-600/20',
};

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: call } = await supabase
    .from('calls')
    .select(
      'id, status, direction, from_number, to_number, created_at, answered_at, ended_at, duration_seconds, talk_seconds, hangup_cause, disposition_note, leads(id, company_name, contact_name), dispositions(name), profiles(full_name)',
    )
    .eq('id', id)
    .single();

  if (!call) notFound();

  const [{ data: transcript }, { data: recordings }, { data: analysis }] = await Promise.all([
    supabase.from('transcripts').select('text, segments').eq('call_id', id).maybeSingle(),
    supabase.from('recordings').select('id, url, format').eq('call_id', id),
    supabase.from('call_ai_analysis').select('*').eq('call_id', id).maybeSingle(),
  ]);

  const objections = (analysis?.objections ?? []) as Objection[];
  const coaching = (analysis?.coaching ?? {}) as Coaching;
  const signals = (analysis?.buying_signals ?? []) as string[];

  return (
    <>
      <PageHeader
        title={call.leads?.company_name ?? formatPhone(call.to_number) ?? 'Opkald'}
        description={`${CALL_STATUS_LABELS[call.status]} · ${formatDateTime(call.created_at)}`}
        action={
          <>
            {call.leads?.id ? (
              <Link
                href={`/leads/${call.leads.id}`}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Se lead
              </Link>
            ) : null}
            {!analysis && transcript?.text ? <AnalyzeButton callId={call.id} /> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {analysis ? (
            <Card>
              <CardHeader
                title="AI-analyse"
                description={`Vurderet af ${analysis.model}`}
                action={
                  analysis.sentiment ? (
                    <Badge className={SENTIMENT_STYLES[analysis.sentiment] ?? ''}>
                      {analysis.sentiment}
                    </Badge>
                  ) : null
                }
              />
              <div className="space-y-5 p-4">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Referat
                  </h3>
                  <p className="mt-1 text-sm text-slate-800">{analysis.summary}</p>
                </div>

                {analysis.next_action ? (
                  <div className="rounded-md bg-brand-50 px-3 py-2.5">
                    <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-700">
                      <Sparkles className="h-3 w-3" aria-hidden />
                      Næste handling
                    </h3>
                    <p className="mt-1 text-sm text-brand-900">{analysis.next_action}</p>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  {objections.length ? (
                    <div>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Indvendinger
                      </h3>
                      <ul className="mt-1 space-y-2">
                        {objections.map((objection, index) => (
                          <li key={index} className="text-sm">
                            <span className="font-medium text-slate-800">{objection.type}</span>
                            <span
                              className={
                                objection.handled ? 'text-emerald-700' : 'text-amber-700'
                              }
                            >
                              {objection.handled ? ' · håndteret' : ' · ikke håndteret'}
                            </span>
                            <p className="text-slate-600">&laquo;{objection.quote}&raquo;</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {signals.length ? (
                    <div>
                      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Købssignaler
                      </h3>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">
                        {signals.map((signal, index) => (
                          <li key={index}>{signal}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {coaching.styrker?.length || coaching.forbedringer?.length ? (
                  <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                    {coaching.styrker?.length ? (
                      <div>
                        <h3 className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                          Det gik godt
                        </h3>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">
                          {coaching.styrker.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {coaching.forbedringer?.length ? (
                      <div>
                        <h3 className="text-xs font-medium uppercase tracking-wide text-amber-700">
                          Kan gøres bedre
                        </h3>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-700">
                          {coaching.forbedringer.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {analysis.lead_score != null ? (
                  <p className="flex items-center gap-1.5 border-t border-slate-200 pt-4 text-sm text-slate-600">
                    <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden />
                    Leadscore efter samtalen:{' '}
                    <span className="tabular font-semibold text-slate-900">
                      {analysis.lead_score}/100
                    </span>
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {recordings?.length ? (
            <Card>
              <CardHeader title="Optagelse" />
              <div className="space-y-3 p-4">
                {recordings.map((recording) => (
                  <audio key={recording.id} controls preload="none" className="w-full">
                    <source src={recording.url} type={`audio/${recording.format}`} />
                    Din browser kan ikke afspille optagelsen.
                  </audio>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Udskrift" />
            {transcript?.text ? (
              <div className="max-h-96 space-y-2 overflow-y-auto p-4">
                {transcript.segments?.length ? (
                  transcript.segments.map((segment, index) => (
                    <p key={index} className="text-sm">
                      <span
                        className={
                          segment.speaker === 'lead'
                            ? 'font-medium text-slate-900'
                            : 'font-medium text-brand-700'
                        }
                      >
                        {segment.speaker === 'lead' ? 'Kunde' : 'Sælger'}:
                      </span>{' '}
                      <span className="text-slate-700">{segment.text}</span>
                    </p>
                  ))
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{transcript.text}</p>
                )}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Der er ingen udskrift af dette opkald.
              </p>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Detaljer" />
          <dl className="divide-y divide-slate-100 text-sm">
            {[
              { label: 'Kontakt', value: call.leads?.contact_name ?? '–' },
              { label: 'Til', value: formatPhone(call.to_number) || '–' },
              { label: 'Fra', value: formatPhone(call.from_number) || '–' },
              { label: 'Sælger', value: call.profiles?.full_name ?? '–' },
              { label: 'Disposition', value: call.dispositions?.name ?? '–' },
              { label: 'Besvaret', value: formatDateTime(call.answered_at) },
              { label: 'Afsluttet', value: formatDateTime(call.ended_at) },
              { label: 'Varighed', value: formatDuration(call.duration_seconds) },
              { label: 'Taletid', value: formatDuration(call.talk_seconds) },
              { label: 'Årsag', value: call.hangup_cause ?? '–' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {call.disposition_note ? (
            <div className="border-t border-slate-200 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Sælgerens note
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {call.disposition_note}
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
