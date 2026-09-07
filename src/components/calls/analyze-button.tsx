'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function AnalyzeButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function handleClick() {
    setMessage('');
    startTransition(async () => {
      const response = await fetch(`/api/calls/${callId}/analyze`, { method: 'POST' });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(payload.error ?? 'Analysen fejlede.');
        return;
      }
      if (payload.message) {
        setMessage(payload.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={pending} variant="secondary">
        <Sparkles className="h-4 w-4" aria-hidden />
        {pending ? 'Analyserer…' : 'Analysér opkaldet'}
      </Button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
