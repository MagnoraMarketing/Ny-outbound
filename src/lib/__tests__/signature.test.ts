import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign as signPayload } from 'node:crypto';

import { verifyTelnyxSignature } from '@/lib/telnyx/signature';

/** Laver et nøglepar på samme form som Telnyx bruger. */
function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { publicKeyBase64: raw.toString('base64'), privateKey };
}

function sign(privateKey: ReturnType<typeof makeKeys>['privateKey'], timestamp: string, body: string) {
  return signPayload(null, Buffer.from(`${timestamp}|${body}`, 'utf8'), privateKey).toString('base64');
}

describe('verifyTelnyxSignature', () => {
  const body = JSON.stringify({ data: { event_type: 'call.answered' } });
  const now = 1_760_000_000_000;
  const timestamp = String(Math.floor(now / 1000));

  it('godkender en korrekt signeret webhook', () => {
    const { publicKeyBase64, privateKey } = makeKeys();
    const result = verifyTelnyxSignature({
      publicKey: publicKeyBase64,
      signature: sign(privateKey, timestamp, body),
      timestamp,
      body,
      now,
    });
    expect(result).toEqual({ valid: true });
  });

  it('afviser hvis body er ændret undervejs', () => {
    const { publicKeyBase64, privateKey } = makeKeys();
    const result = verifyTelnyxSignature({
      publicKey: publicKeyBase64,
      signature: sign(privateKey, timestamp, body),
      timestamp,
      body: body.replace('call.answered', 'call.hangup'),
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'Signaturen matcher ikke' });
  });

  it('afviser en signatur fra en anden nøgle', () => {
    const { publicKeyBase64 } = makeKeys();
    const other = makeKeys();
    const result = verifyTelnyxSignature({
      publicKey: publicKeyBase64,
      signature: sign(other.privateKey, timestamp, body),
      timestamp,
      body,
      now,
    });
    expect(result.valid).toBe(false);
  });

  it('afviser gamle webhooks, så en opsnappet request ikke kan afspilles igen', () => {
    const { publicKeyBase64, privateKey } = makeKeys();
    const oldTimestamp = String(Math.floor(now / 1000) - 3600);
    const result = verifyTelnyxSignature({
      publicKey: publicKeyBase64,
      signature: sign(privateKey, oldTimestamp, body),
      timestamp: oldTimestamp,
      body,
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'Webhooken er for gammel' });
  });

  it('afviser når signatur eller tidsstempel mangler', () => {
    const { publicKeyBase64 } = makeKeys();
    expect(
      verifyTelnyxSignature({ publicKey: publicKeyBase64, signature: null, timestamp, body, now }),
    ).toEqual({ valid: false, reason: 'Signatur mangler' });
    expect(
      verifyTelnyxSignature({
        publicKey: publicKeyBase64,
        signature: 'x',
        timestamp: null,
        body,
        now,
      }),
    ).toEqual({ valid: false, reason: 'Tidsstempel mangler' });
  });

  it('afviser en signatur med forkert længde', () => {
    const { publicKeyBase64 } = makeKeys();
    const result = verifyTelnyxSignature({
      publicKey: publicKeyBase64,
      signature: Buffer.from('for kort').toString('base64'),
      timestamp,
      body,
      now,
    });
    expect(result).toEqual({ valid: false, reason: 'Signaturen har forkert længde' });
  });

  it('fejler tydeligt hvis den konfigurerede public key er forkert', () => {
    const result = verifyTelnyxSignature({
      publicKey: Buffer.alloc(16).toString('base64'),
      signature: Buffer.alloc(64).toString('base64'),
      timestamp,
      body,
      now,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('32 bytes');
  });
});
