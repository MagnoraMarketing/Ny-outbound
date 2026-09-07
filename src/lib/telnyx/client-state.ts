/**
 * client_state følger opkaldet gennem alle Telnyx-webhooks, så en hændelse kan
 * kobles til den rigtige række i vores database. Telnyx kræver base64.
 *
 * Ligger adskilt fra client.ts, som er server-only, fordi kodningen er ren
 * logik der skal kunne testes for sig.
 */
export interface ClientState {
  callId: string;
  orgId: string;
  sessionId?: string;
  /** Sat på agentens eget ben i parallel-mode. */
  role?: 'agent' | 'lead';
}

export function encodeClientState(state: ClientState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
}

export function decodeClientState(value: string | null | undefined): ClientState | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ClientState).callId === 'string' &&
      typeof (parsed as ClientState).orgId === 'string'
    ) {
      return parsed as ClientState;
    }

    return null;
  } catch {
    return null;
  }
}
