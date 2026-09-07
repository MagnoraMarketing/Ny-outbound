import { NextResponse } from 'next/server';

import { requireSession } from '@/lib/auth';
import { createWebRtcToken } from '@/lib/telnyx/client';

export const dynamic = 'force-dynamic';

/**
 * Udleverer et kortlivet Telnyx-token som browseren logger på med.
 * API-nøglen forlader aldrig serveren.
 */
export async function GET() {
  const { profile } = await requireSession();

  try {
    const token = await createWebRtcToken(`ny-outbound-${profile.id}`);
    return NextResponse.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ukendt fejl';
    return NextResponse.json(
      { error: `Kunne ikke hente telefoni-token: ${message}` },
      { status: 502 },
    );
  }
}
