'use server';

import { revalidatePath } from 'next/cache';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function completeTask(taskId: string) {
  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId);

  revalidatePath('/opgaver');
  return error ? { error: error.message } : {};
}
