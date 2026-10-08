import { describe, expect, it } from 'vitest';
import { createPinCredential, lockoutDelay, verifyPin } from './appLock.js';

describe('app lock PIN credentials', () => {
  it('verifies the right PIN and rejects a wrong PIN', async () => {
    const credential = await createPinCredential('123456');

    await expect(verifyPin('123456', credential)).resolves.toBe(true);
    await expect(verifyPin('654321', credential)).resolves.toBe(false);
  });

  it('rejects malformed credentials', async () => {
    await expect(verifyPin('123456', {})).resolves.toBe(false);
    await expect(verifyPin('123456', { version: 1, salt: 'bad!', signature: 'bad!' })).resolves.toBe(false);
  });
});
describe('lockoutDelay', () => {
  it('allows four free attempts then backs off up to a cap', () => {
    expect(lockoutDelay(4)).toBe(0);
    expect(lockoutDelay(5)).toBe(30_000);
    expect(lockoutDelay(6)).toBe(60_000);
    expect(lockoutDelay(30)).toBe(15 * 60_000);
  });
});