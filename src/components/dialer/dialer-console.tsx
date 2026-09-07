'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Mic, MicOff, PhoneOff, PhoneOutgoing, SkipForward } from 'lucide-react';

import { applyDisposition, endSession, fetchQueue, startSession } from '@/app/(app)/dialer/actions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useTelnyxPhone } from '@/hooks/use-telnyx-phone';
import { MAX_PARALLEL_LINES, withinCallingHours, type QueueLead } from '@/lib/dialer/queue';
import { formatDuration, formatPhone } from '@/lib/utils';
import type { DialerMode, Disposition, LeadList } from '@/lib/supabase/database.types';

interface Props {
  lists: Pick<LeadList, 'id' | 'name'>[];
  dispositions: Disposition[];
  callerId: string | null;
  activeSessionId: string | null;
  /** Sat når sælgeren kom hertil fra et bestemt lead eller en opgave. */
  requestedLead: QueueLead | null;
}

export function DialerConsole({
  lists,
  dispositions,
  callerId,
  activeSessionId,
  requestedLead,
}: Props) {
  const phone = useTelnyxPhone();
  const [pending, startTransition] = useTransition();

  const [sessionId, setSessionId] = useState<string | null>(activeSessionId);
  const [mode, setMode] = useState<DialerMode>('power');
  const [lines, setLines] = useState(2);
  const [listId, setListId] = useState<string>('');

  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [current, setCurrent] = useState<QueueLead | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [dispositionId, setDispositionId] = useState('');
  const [note, setNote] = useState('');
  const [meetingAt, setMeetingAt] = useState('');

  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const outsideHours = useMemo(() => !withinCallingHours(), []);
  const selectedDisposition = dispositions.find((d) => d.id === dispositionId);
  const needsMeetingTime = selectedDisposition?.category === 'meeting';

  // Taletid tælles så længe der er en aktiv samtale.
  useEffect(() => {
    if (phone.callState === 'active') {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phone.callState]);

  async function loadQueue() {
    const result = await fetchQueue(listId || null);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    // Er man kommet hertil fra et bestemt lead, skal det ligge forrest.
    // Sælgeren må gerne springe koens prioritering over - men ikke de to
    // regler der ikke er til forhandling: intet nummer, eller do-not-call.
    const canDial = requestedLead && !requestedLead.do_not_call && requestedLead.phone;
    const leads = canDial
      ? [requestedLead, ...result.leads.filter((lead) => lead.id !== requestedLead.id)]
      : result.leads;

    setQueue(leads);
    if (!leads.length) setMessage('Der er ingen leads klar til opkald lige nu.');
  }

  function handleStart() {
    startTransition(async () => {
      setMessage('');
      const result = await startSession(mode, lines, listId || null);
      if (result.error || !result.sessionId) {
        setMessage(result.error ?? 'Kunne ikke starte sessionen.');
        return;
      }
      setSessionId(result.sessionId);
      await phone.connect();
      await loadQueue();
    });
  }

  function handleStop() {
    startTransition(async () => {
      if (sessionId) await endSession(sessionId);
      phone.disconnect();
      setSessionId(null);
      setCurrent(null);
      setCallId(null);
      setQueue([]);
    });
  }

  async function dialLead(lead: QueueLead) {
    setMessage('');
    setSeconds(0);
    setDispositionId('');
    setNote('');
    setMeetingAt('');

    const response = await fetch('/api/dialer/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, sessionId }),
    });

    const payload = (await response.json()) as {
      callId?: string;
      to?: string;
      from?: string;
      error?: string;
    };

    if (!response.ok || !payload.callId || !payload.to || !payload.from) {
      setMessage(payload.error ?? 'Opkaldet kunne ikke oprettes.');
      return;
    }

    setCurrent(lead);
    setCallId(payload.callId);

    phone.startCall({
      destinationNumber: payload.to,
      callerNumber: payload.from,
      callId: payload.callId,
    });
  }

  function handleNext() {
    const [next, ...rest] = queue;
    if (!next) {
      setMessage('Køen er tom. Hent flere leads eller vælg en anden liste.');
      return;
    }
    setQueue(rest);
    void dialLead(next);
  }

  function handleSaveDisposition() {
    if (!callId || !dispositionId) return;

    startTransition(async () => {
      const result = await applyDisposition(
        callId,
        dispositionId,
        note,
        needsMeetingTime ? meetingAt : null,
      );

      if (result.error) {
        setMessage(result.error);
        return;
      }

      setCallId(null);
      setCurrent(null);
      setSeconds(0);
      setDispositionId('');
      setNote('');
      setMeetingAt('');

      if (queue.length === 0) await loadQueue();
    });
  }

  if (!callerId) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-700">
          Der er ikke sat et afsendernummer endnu, så der kan ikke ringes ud.
        </p>
        <Link
          href="/indstillinger"
          className="mt-2 inline-block text-sm font-medium text-brand-600 underline"
        >
          Sæt afsendernummer under Indstillinger
        </Link>
      </Card>
    );
  }

  if (!sessionId) {
    return (
      <Card>
        <CardHeader title="Start en ringesession" description="Vælg liste og arbejdsform." />
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="list">Liste</Label>
            <Select id="list" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">Alle leads</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mode">Arbejdsform</Label>
            <Select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as DialerMode)}
            >
              <option value="power">Power - ét opkald ad gangen</option>
              <option value="parallel">Parallel - flere linjer samtidig</option>
              <option value="manual">Manuel - du vælger selv hvert lead</option>
            </Select>
          </div>

          {mode === 'parallel' ? (
            <div className="space-y-1.5">
              <Label htmlFor="lines">Antal linjer</Label>
              <Input
                id="lines"
                type="number"
                min={1}
                max={MAX_PARALLEL_LINES}
                value={lines}
                onChange={(e) => setLines(Number(e.target.value))}
              />
              <p className="text-xs text-slate-500">
                Højst {MAX_PARALLEL_LINES} linjer. Flere linjer end du kan nå at tage giver
                stille opkald hos modtageren.
              </p>
            </div>
          ) : null}

          {requestedLead ? (
            requestedLead.do_not_call || !requestedLead.phone ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {requestedLead.company_name} kan ikke ringes op
                {requestedLead.do_not_call
                  ? ' og er markeret som "må ikke kontaktes".'
                  : ', fordi der ikke er noget telefonnummer.'}
              </p>
            ) : (
              <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">
                {requestedLead.company_name} ligger først i køen når du starter.
              </p>
            )
          ) : null}

          {outsideHours ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Det er uden for normal ringetid (hverdage 8-17). Du kan godt ringe, men
              overvej om modtagerne er på arbejde.
            </p>
          ) : null}

          {message ? (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {message}
            </p>
          ) : null}

          <Button size="lg" onClick={handleStart} disabled={pending}>
            {pending ? 'Starter…' : 'Start session'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader
            title={current ? current.company_name : 'Klar til næste opkald'}
            description={
              current ? formatPhone(current.phone) : `${queue.length} leads i køen`
            }
            action={
              <span className="tabular text-sm text-slate-500">
                {phone.callState === 'active' ? formatDuration(seconds) : ''}
              </span>
            }
          />

          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="lg"
                onClick={handleNext}
                disabled={pending || phone.inCall || phone.status !== 'ready'}
              >
                <PhoneOutgoing className="h-4 w-4" aria-hidden />
                Ring til næste
              </Button>

              {phone.inCall ? (
                <>
                  <Button variant="danger" size="lg" onClick={phone.hangup}>
                    <PhoneOff className="h-4 w-4" aria-hidden />
                    Læg på
                  </Button>
                  <Button variant="secondary" size="lg" onClick={phone.toggleMute}>
                    {phone.muted ? (
                      <MicOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Mic className="h-4 w-4" aria-hidden />
                    )}
                    {phone.muted ? 'Slå lyd til' : 'Mute'}
                  </Button>
                </>
              ) : null}

              <Button variant="ghost" size="lg" onClick={handleStop} disabled={pending}>
                Afslut session
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Telefon:{' '}
              {phone.status === 'ready'
                ? 'forbundet'
                : phone.status === 'connecting'
                  ? 'forbinder…'
                  : phone.status === 'error'
                    ? 'fejl'
                    : 'ikke forbundet'}
              {phone.callState ? ` · opkald: ${phone.callState}` : ''}
            </p>

            {phone.error ? (
              <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {phone.error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
            ) : null}
          </div>
        </Card>

        {callId ? (
          <Card>
            <CardHeader
              title="Registrér udfald"
              description="Vælg hvad der kom ud af opkaldet, så leadet får den rigtige opfølgning."
            />
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {dispositions.map((disposition) => (
                  <button
                    key={disposition.id}
                    type="button"
                    onClick={() => setDispositionId(disposition.id)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ring-1 ring-inset transition-colors ${
                      dispositionId === disposition.id
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {disposition.name}
                  </button>
                ))}
              </div>

              {needsMeetingTime ? (
                <div className="space-y-1.5">
                  <Label htmlFor="meeting">Mødetidspunkt</Label>
                  <Input
                    id="meeting"
                    type="datetime-local"
                    value={meetingAt}
                    onChange={(e) => setMeetingAt(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  rows={3}
                  value={note}
                  placeholder="Hvad blev der sagt?"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveDisposition}
                  disabled={pending || !dispositionId || (needsMeetingTime && !meetingAt)}
                >
                  Gem og fortsæt
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCallId(null);
                    setCurrent(null);
                  }}
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                  Spring over
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Kø"
          description={`${queue.length} klar`}
          action={
            <Button size="sm" variant="secondary" onClick={() => void loadQueue()}>
              Opdatér
            </Button>
          }
        />
        {queue.length ? (
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {queue.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {lead.company_name}
                  </p>
                  <p className="tabular text-xs text-slate-500">{formatPhone(lead.phone)}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {lead.call_attempts > 0 ? `${lead.call_attempts} forsøg` : 'ny'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Køen er tom.</p>
        )}
      </Card>
    </div>
  );
}
