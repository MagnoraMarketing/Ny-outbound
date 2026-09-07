import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { DialerConsole } from '@/components/dialer/dialer-console';

export const dynamic = 'force-dynamic';

export default async function DialerPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { profile, organization } = await requireSession();
  const { lead: requestedLeadId } = await searchParams;
  const supabase = await createClient();

  const [{ data: lists }, { data: dispositions }, { data: session }] = await Promise.all([
    supabase.from('lead_lists').select('id, name').order('created_at', { ascending: false }),
    supabase
      .from('dispositions')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('dialer_sessions')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  // Kommer sælgeren fra et lead eller en opgave, skal netop det lead ligge
  // klar i konsollen i stedet for bare at åbne en tom dialer.
  const { data: requestedLead } = requestedLeadId
    ? await supabase
        .from('leads')
        .select(
          'id, company_name, phone, status, do_not_call, call_attempts, last_call_at, next_follow_up_at',
        )
        .eq('id', requestedLeadId)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader
        title="Dialer"
        description="Ring gennem din liste, registrér udfald og lad opfølgningen oprette sig selv."
      />
      <DialerConsole
        lists={lists ?? []}
        dispositions={dispositions ?? []}
        callerId={profile.caller_id ?? organization.default_caller_id}
        activeSessionId={session?.id ?? null}
        requestedLead={requestedLead}
      />
    </>
  );
}
