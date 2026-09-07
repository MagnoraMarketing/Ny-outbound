import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { encodeClientState } from '@/lib/telnyx/client';
import { isCallable } from '@/lib/dialer/queue';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  leadId: z.string().uuid(),
  sessionId: z.string().uuid().nullable().optional(),
});

/**
 * Registrerer et opkald før browseren ringer op.
 *
 * Rækken oprettes her, så webhooken har noget at skrive resultatet ind i, og
 * så et opkald aldrig kan forsvinde fordi browseren lukkede undervejs.
 */
export async function POST(request: Request) {
  const { profile, organization } = await requireSession();
  const supabase = await createClient();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ugyldig forespørgsel.' }, { status: 400 });
  }

  const { leadId, sessionId } = parsed.data;

  const { data: lead } = await supabase
    .from('leads')
    .select(
      'id, company_name, phone, status, do_not_call, call_attempts, last_call_at, next_follow_up_at',
    )
    .eq('id', leadId)
    .single();

  if (!lead) {
    return NextResponse.json({ error: 'Leadet blev ikke fundet.' }, { status: 404 });
  }

  // Sidste kontrol før der ringes: reglerne håndhæves på serveren, ikke i UI'et.
  if (lead.do_not_call || !lead.phone) {
    return NextResponse.json(
      { error: 'Dette lead må ikke ringes op.' },
      { status: 409 },
    );
  }

  const from = profile.caller_id ?? organization.default_caller_id;
  if (!from) {
    return NextResponse.json(
      { error: 'Der er ikke sat et afsendernummer. Gør det under Indstillinger.' },
      { status: 409 },
    );
  }

  const { data: call, error } = await supabase
    .from('calls')
    .insert({
      org_id: profile.org_id,
      lead_id: lead.id,
      user_id: profile.id,
      session_id: sessionId ?? null,
      direction: 'outbound',
      status: 'queued',
      from_number: from,
      to_number: lead.phone,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !call) {
    return NextResponse.json(
      { error: `Kunne ikke oprette opkaldet: ${error?.message ?? 'ukendt fejl'}` },
      { status: 500 },
    );
  }

  await supabase
    .from('leads')
    .update({
      call_attempts: lead.call_attempts + 1,
      last_call_at: new Date().toISOString(),
      status: lead.status === 'new' ? 'attempting' : lead.status,
    })
    .eq('id', lead.id);

  return NextResponse.json({
    callId: call.id,
    to: lead.phone,
    from,
    // Følger opkaldet gennem webhooks, så resultatet lander på den rigtige række.
    clientState: encodeClientState({
      callId: call.id,
      orgId: profile.org_id,
      sessionId: sessionId ?? undefined,
      role: 'lead',
    }),
    warning: isCallable(lead) ? undefined : 'Leadet er uden for den normale kø.',
  });
}
