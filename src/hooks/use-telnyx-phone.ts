'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

export type PhoneStatus = 'idle' | 'connecting' | 'ready' | 'error';

export type CallState =
  | 'new'
  | 'trying'
  | 'ringing'
  | 'active'
  | 'held'
  | 'hangup'
  | 'destroy';

/** Den delmængde af Telnyx' call-objekt vi faktisk bruger. */
interface TelnyxCall {
  state: string;
  hangup: () => void;
  muteAudio: () => void;
  unmuteAudio: () => void;
  dtmf: (digit: string) => void;
  options?: { telnyxCallControlId?: string };
}

interface NewCallOptions {
  destinationNumber: string;
  callerNumber: string;
  /** Sendes med som SIP-header, så webhooken kan finde vores række. */
  callId: string;
}

/**
 * Holder én Telnyx WebRTC-forbindelse i live og udstiller det dialeren skal
 * bruge: ring op, læg på, mute. Tokenet hentes fra vores eget endpoint, så
 * API-nøglen aldrig når browseren.
 */
export function useTelnyxPhone() {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const callRef = useRef<TelnyxCall | null>(null);

  const [status, setStatus] = useState<PhoneStatus>('idle');
  const [error, setError] = useState<string>('');
  const [callState, setCallState] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);

  const connect = useCallback(async () => {
    if (clientRef.current) return;

    setStatus('connecting');
    setError('');

    try {
      const response = await fetch('/api/telnyx/token');
      const payload = (await response.json()) as { token?: string; error?: string };

      if (!response.ok || !payload.token) {
        throw new Error(payload.error ?? 'Kunne ikke hente telefoni-token.');
      }

      const client = new TelnyxRTC({ login_token: payload.token });

      client.on('telnyx.ready', () => setStatus('ready'));

      client.on('telnyx.error', (event: unknown) => {
        const message =
          event && typeof event === 'object' && 'error' in event
            ? String((event as { error: unknown }).error)
            : 'Ukendt fejl i telefonforbindelsen.';
        setError(message);
        setStatus('error');
      });

      client.on('telnyx.socket.close', () => {
        setStatus('idle');
        clientRef.current = null;
      });

      client.on('telnyx.notification', (notification: { type: string; call?: TelnyxCall }) => {
        if (notification.type !== 'callUpdate' || !notification.call) return;

        const call = notification.call;
        callRef.current = call;
        setCallState(call.state as CallState);

        if (call.state === 'destroy' || call.state === 'hangup') {
          callRef.current = null;
          setMuted(false);
        }
      });

      await client.connect();
      clientRef.current = client;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke forbinde til telefonien.');
      setStatus('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    callRef.current?.hangup();
    clientRef.current?.disconnect();
    clientRef.current = null;
    callRef.current = null;
    setStatus('idle');
    setCallState(null);
  }, []);

  const startCall = useCallback(
    ({ destinationNumber, callerNumber, callId }: NewCallOptions) => {
      const client = clientRef.current;
      if (!client) {
        setError('Telefonen er ikke forbundet endnu.');
        return false;
      }

      try {
        const call = client.newCall({
          destinationNumber,
          callerNumber,
          audio: true,
          video: false,
          // Headeren følger med ind i Call Control, så webhooken kan koble
          // opkaldet til den række vi lige har oprettet.
          customHeaders: [{ name: 'X-Call-Id', value: callId }],
        }) as unknown as TelnyxCall;

        callRef.current = call;
        setCallState('trying');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Opkaldet kunne ikke startes.');
        return false;
      }
    },
    [],
  );

  const hangup = useCallback(() => {
    callRef.current?.hangup();
    callRef.current = null;
    setCallState(null);
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;

    setMuted((current) => {
      if (current) call.unmuteAudio();
      else call.muteAudio();
      return !current;
    });
  }, []);

  const sendDigit = useCallback((digit: string) => {
    callRef.current?.dtmf(digit);
  }, []);

  // Luft forbindelsen når konsollen forlades, så mikrofonen slippes.
  useEffect(() => {
    return () => {
      callRef.current?.hangup();
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    status,
    error,
    callState,
    muted,
    connect,
    disconnect,
    startCall,
    hangup,
    toggleMute,
    sendDigit,
    inCall: callState === 'active' || callState === 'ringing' || callState === 'trying',
  };
}
