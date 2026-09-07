import { createPublicKey, verify as verifySignature } from 'node:crypto';

/**
 * Telnyx signerer webhooks med Ed25519. Signaturen dækker
 * `${timestamp}|${rå body}`, så body skal verificeres præcis som modtaget -
 * aldrig efter JSON.parse og re-serialisering.
 */

/** Hvor gammel en webhook må være før den afvises (replay-beskyttelse). */
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

/**
 * Telnyx udleverer den offentlige nøgle som 32 rå base64-kodede bytes.
 * Node kræver SPKI-DER, så nøglen pakkes ind i den faste Ed25519-header.
 */
function toPublicKey(base64Key: string) {
  const raw = Buffer.from(base64Key, 'base64');

  if (raw.length !== 32) {
    throw new Error(
      `Telnyx public key skal være 32 bytes, men var ${raw.length}. Tjek TELNYX_PUBLIC_KEY.`,
    );
  }

  const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
  return createPublicKey({
    key: Buffer.concat([spkiHeader, raw]),
    format: 'der',
    type: 'spki',
  });
}

export interface VerifyOptions {
  publicKey: string;
  signature: string | null;
  timestamp: string | null;
  /** Rå request body, nøjagtig som den kom ind. */
  body: string;
  toleranceSeconds?: number;
  /** Kun til test - ellers bruges den aktuelle tid. */
  now?: number;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

export function verifyTelnyxSignature({
  publicKey,
  signature,
  timestamp,
  body,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Date.now(),
}: VerifyOptions): VerifyResult {
  if (!signature) return { valid: false, reason: 'Signatur mangler' };
  if (!timestamp) return { valid: false, reason: 'Tidsstempel mangler' };

  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt)) {
    return { valid: false, reason: 'Tidsstemplet kan ikke læses' };
  }

  const ageSeconds = Math.abs(now / 1000 - sentAt);
  if (ageSeconds > toleranceSeconds) {
    return { valid: false, reason: 'Webhooken er for gammel' };
  }

  let key;
  try {
    key = toPublicKey(publicKey);
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Ugyldig public key',
    };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, 'base64');
  } catch {
    return { valid: false, reason: 'Signaturen kan ikke afkodes' };
  }

  if (signatureBytes.length !== 64) {
    return { valid: false, reason: 'Signaturen har forkert længde' };
  }

  const signedPayload = Buffer.from(`${timestamp}|${body}`, 'utf8');
  const ok = verifySignature(null, signedPayload, key, signatureBytes);

  return ok ? { valid: true } : { valid: false, reason: 'Signaturen matcher ikke' };
}
