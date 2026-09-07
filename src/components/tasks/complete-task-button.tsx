'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Check } from 'lucide-react';

import { completeTask } from '@/app/(app)/opgaver/actions';
import { Button } from '@/components/ui/button';

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await completeTask(taskId);
          router.refresh();
        })
      }
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
      Fuldført
    </Button>
  );
}
