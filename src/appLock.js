const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const MESSAGE = encoder.encode('Pesa Trail app lock PIN verification');

function cryptoApi() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('PIN protection requires a secure browser context (HTTPS or localhost).');
  }
  return globalThis.crypto;
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveKey(pin, salt) {
  const crypto = cryptoApi();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

export async function createPinCredential(pin) {
  const crypto = cryptoApi();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const signature = await crypto.subtle.sign('HMAC', key, MESSAGE);
  return { version: 1, salt: toBase64(salt), signature: toBase64(signature) };
}

export async function verifyPin(pin, credential) {
  if (typeof pin !== 'string') return false;
  if (
    credential?.version !== 1 ||
    typeof credential.salt !== 'string' ||
    typeof credential.signature !== 'string'
  ) return false;

  let salt;
  let signature;
  try {
    salt = fromBase64(credential.salt);
    signature = fromBase64(credential.signature);
  } catch {
    return false;
  }
  if (salt.length !== 16 || signature.length !== 32) return false;

  const key = await deriveKey(pin, salt);
  return cryptoApi().subtle.verify('HMAC', key, signature, MESSAGE);
}
// Speed bump for repeated wrong PINs: free for 4 tries, then 30s, 60s, 2min ... capped at 15min.
// This is client-side only, so it slows casual guessing; it is not a security boundary.
export function lockoutDelay(failures) {
  if (failures < 5) return 0;
  return Math.min(30_000 * 2 ** (failures - 5), 15 * 60_000);
}