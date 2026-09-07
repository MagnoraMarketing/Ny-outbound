'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addNote, createFollowUp, updateLeadStatus } from '@/app/(app)/leads/actions';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { LEAD_STATUS_LABELS } from '@/lib/constants';
import type { LeadStatus } from '@/lib/supabase/database.types';

export function LeadActions({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('Ring igen');
  const [followUpAt, setFollowUpAt] = useState('');
  const [error, setError] = useState('');

  function run(action: () => Promise<{ error?: string }>, onDone?: () => void) {
    setError('');
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={status}
          disabled={pending}
          onChange={(event) =>
            run(() => updateLeadStatus(leadId, event.target.value as LeadStatus))
          }
        >
          {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((value) => (
            <option key={value} value={value}>
              {LEAD_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Tilføj note</Label>
        <Textarea
          id="note"
          rows={3}
          value={note}
          placeholder="Hvad blev der aftalt?"
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !note.trim()}
          onClick={() => run(() => addNote(leadId, note), () => setNote(''))}
        >
          Gem note
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="follow-up-title">Planlæg opfølgning</Label>
        <Input
          id="follow-up-title"
          value={followUpTitle}
          onChange={(event) => setFollowUpTitle(event.target.value)}
        />
        <Input
          type="datetime-local"
          aria-label="Tidspunkt for opfølgning"
          value={followUpAt}
          onChange={(event) => setFollowUpAt(event.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !followUpAt}
          onClick={() =>
            run(
              () => createFollowUp(leadId, followUpTitle, followUpAt),
              () => setFollowUpAt(''),
            )
          }
        >
          Opret opfølgning
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
