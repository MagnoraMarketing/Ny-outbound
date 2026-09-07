import Link from 'next/link';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { CompleteTaskButton } from '@/components/tasks/complete-task-button';
import { Card, CardHeader } from '@/components/ui/card';
import { formatDateTime, formatPhone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  await requireSession();
  const supabase = await createClient();

  const now = new Date().toISOString();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, due_at, source, leads(id, company_name, phone)')
    .eq('status', 'open')
    .order('due_at', { ascending: true })
    .limit(100);

  const overdue = (tasks ?? []).filter((task) => task.due_at <= now);
  const upcoming = (tasks ?? []).filter((task) => task.due_at > now);

  const groups = [
    { title: 'Forfaldne', description: 'Skulle have været fulgt op', items: overdue },
    { title: 'Kommende', description: 'Planlagt frem i tiden', items: upcoming },
  ];

  return (
    <>
      <PageHeader
        title="Opgaver"
        description="Opfølgninger fra dispositioner, AI-forslag og dine egne aftaler."
      />

      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader
              title={group.title}
              description={`${group.items.length} ${group.description.toLowerCase()}`}
            />
            {group.items.length ? (
              <ul className="divide-y divide-slate-100">
                {group.items.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{task.title}</p>
                      <p className="text-xs text-slate-500">
                        {task.leads?.company_name ? (
                          <Link
                            href={`/leads/${task.leads.id}`}
                            className="hover:text-brand-700"
                          >
                            {task.leads.company_name}
                          </Link>
                        ) : null}
                        {task.leads?.phone ? ` · ${formatPhone(task.leads.phone)}` : ''}
                        {' · '}
                        {formatDateTime(task.due_at)}
                      </p>
                      {task.description ? (
                        <p className="mt-0.5 text-sm text-slate-600">{task.description}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {task.leads?.id ? (
                        <Link
                          href={`/dialer?lead=${task.leads.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          Ring
                        </Link>
                      ) : null}
                      <CompleteTaskButton taskId={task.id} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Ingen opgaver her.
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
