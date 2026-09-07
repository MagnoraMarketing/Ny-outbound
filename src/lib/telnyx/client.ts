import 'server-only';

import { env } from '@/lib/env';

const API_BASE = 'https://api.telnyx.com/v2';

export class TelnyxError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'TelnyxError';
  }
}

async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.telnyxApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail =
      (payload as { errors?: { detail?: string }[] } | null)?.errors?.[0]?.detail ??
      response.statusText;
    throw new TelnyxError(`Telnyx ${init.method} ${path}: ${detail}`, response.status, payload);
  }

  return (payload as { data: T }).data;
}

/**
 * client_state følger opkaldet gennem alle webhooks, så en hændelse kan
 * kobles til den rigtige række i vores database. Telnyx kræver base64.
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

export interface DialOptions {
  to: string;
  from: string;
  connectionId?: string;
  clientState: ClientState;
  /** Læg på hvis der ikke svares inden for så mange sekunder. */
  timeoutSeconds?: number;
  /** Stop opkaldet hvis en telefonsvarer tager den. */
  detectAnsweringMachine?: boolean;
}

export interface TelnyxCall {
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  is_alive?: boolean;
}

export function dial({
  to,
  from,
  connectionId,
  clientState,
  timeoutSeconds = 25,
  detectAnsweringMachine = true,
}: DialOptions): Promise<TelnyxCall> {
  return request<TelnyxCall>('/calls', {
    method: 'POST',
    body: {
      to,
      from,
      connection_id: connectionId ?? env.telnyxConnectionId(),
      timeout_secs: timeoutSeconds,
      client_state: encodeClientState(clientState),
      webhook_url: `${env.appUrl()}/api/telnyx/webhook`,
      // premium giver markant færre falske positiver end standard
      answering_machine_detection: detectAnsweringMachine ? 'premium' : 'disabled',
    },
  });
}

export function hangup(callControlId: string): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/hangup`, { method: 'POST' });
}

export function answer(callControlId: string, clientState?: ClientState): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/answer`, {
    method: 'POST',
    body: clientState ? { client_state: encodeClientState(clientState) } : {},
  });
}

/** Kobler to ben sammen, fx agentens ben og det lead der tog telefonen. */
export function bridge(callControlId: string, otherCallControlId: string): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/bridge`, {
    method: 'POST',
    body: { call_control_id: otherCallControlId },
  });
}

/**
 * Starter optagelse i dual-kanal, så agent og lead ligger i hver sin kanal.
 * Det gør transskriptionen markant lettere at fordele på talere.
 */
export function startRecording(callControlId: string): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/record_start`, {
    method: 'POST',
    body: { format: 'mp3', channels: 'dual', trim: 'trim-silence' },
  });
}

export function startTranscription(
  callControlId: string,
  language = 'da',
): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/transcription_start`, {
    method: 'POST',
    body: {
      language,
      transcription_engine: 'B',
      transcription_tracks: 'both',
    },
  });
}

export function speak(callControlId: string, payload: string, language = 'da-DK'): Promise<unknown> {
  return request(`/calls/${callControlId}/actions/speak`, {
    method: 'POST',
    body: { payload, voice: 'female', language },
  });
}

/**
 * Opretter en midlertidig SIP-legitimation og bytter den til et token,
 * som browseren logger på Telnyx med. Tokenet er kortlivet, så en lækket
 * token ikke giver varig adgang til at ringe.
 */
export async function createWebRtcToken(name: string): Promise<string> {
  const credential = await request<{ id: string }>('/telephony_credentials', {
    method: 'POST',
    body: {
      connection_id: env.telnyxConnectionId(),
      name,
      // Legitimationen udløber efter en arbejdsdag
      expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
  });

  // Token-endpointet svarer med den rå JWT som tekst, ikke som JSON,
  // så det kan ikke gå gennem request() der forventer { data: ... }.
  const response = await fetch(`${API_BASE}/telephony_credentials/${credential.id}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.telnyxApiKey()}` },
    cache: 'no-store',
  });

  const token = (await response.text()).trim();

  if (!response.ok || !token) {
    throw new TelnyxError(
      `Kunne ikke hente WebRTC-token: ${response.statusText}`,
      response.status,
      token,
    );
  }

  return token;
}
