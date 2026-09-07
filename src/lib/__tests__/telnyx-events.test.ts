import { describe, expect, it } from 'vitest';

import { decodeClientState, encodeClientState } from '@/lib/telnyx/client-state';
import { parseWebhook, statusFromHangupCause } from '@/lib/telnyx/events';

describe('client_state', () => {
  it('overlever turen gennem base64', () => {
    const state = {
      callId: '11111111-1111-1111-1111-111111111111',
      orgId: '22222222-2222-2222-2222-222222222222',
      sessionId: '33333333-3333-3333-3333-333333333333',
      role: 'lead' as const,
    };
    expect(decodeClientState(encodeClientState(state))).toEqual(state);
  });

  it('giver null i stedet for at kaste på skrald', () => {
    expect(decodeClientState(null)).toBeNull();
    expect(decodeClientState('')).toBeNull();
    expect(decodeClientState('ikke base64 !!')).toBeNull();
    // Gyldig base64, men ikke JSON
    expect(decodeClientState(Buffer.from('hej').toString('base64'))).toBeNull();
  });

  it('afviser state uden de felter vi regner med', () => {
    const partial = Buffer.from(JSON.stringify({ callId: 'x' })).toString('base64');
    expect(decodeClientState(partial)).toBeNull();
  });
});

describe('parseWebhook', () => {
  it('læser en normal hændelse', () => {
    const event = parseWebhook(
      JSON.stringify({
        data: { id: 'evt_1', event_type: 'call.answered', payload: { call_control_id: 'v3:abc' } },
      }),
    );
    expect(event?.data.event_type).toBe('call.answered');
    expect(event?.data.payload.call_control_id).toBe('v3:abc');
  });

  it('afviser payloads der ikke har den forventede form', () => {
    expect(parseWebhook('ikke json')).toBeNull();
    expect(parseWebhook('{}')).toBeNull();
    expect(parseWebhook(JSON.stringify({ data: { event_type: 'x' } }))).toBeNull();
    expect(parseWebhook(JSON.stringify({ data: { payload: {} } }))).toBeNull();
  });
});

describe('statusFromHangupCause', () => {
  it('oversætter de årsager vi ser i praksis', () => {
    expect(statusFromHangupCause('normal_clearing')).toBe('completed');
    expect(statusFromHangupCause('user_busy')).toBe('busy');
    expect(statusFromHangupCause('no_answer')).toBe('no_answer');
    expect(statusFromHangupCause('timeout')).toBe('no_answer');
    expect(statusFromHangupCause('originator_cancel')).toBe('canceled');
  });

  it('falder tilbage til failed på det ukendte', () => {
    expect(statusFromHangupCause('noget_helt_andet')).toBe('failed');
    expect(statusFromHangupCause(undefined)).toBe('failed');
  });
});
