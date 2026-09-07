import { NextResponse } from 'next/server';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { runAnalysisForCall } from '@/lib/ai/run';

export const dynamic = 'force-dynamic';
// Analysen kan tage et stykke tid på en lang samtale.
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  // Slås op som den indloggede bruger, så RLS bekræfter at opkaldet
  // hører til brugerens egen organisation, før service role tager over.
  const supabase = await createClient();
  const { data: call } = await supabase.from('calls').select('id').eq('id', id).maybeSingle();

  if (!call) {
    return NextResponse.json({ error: 'Opkaldet blev ikke fundet.' }, { status: 404 });
  }

  const result = await runAnalysisForCall(id);

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json(result);
}
