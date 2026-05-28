import { describe, it, expect } from 'vitest';
import { sha256hex } from '../lib/stl/hash';

describe('sha256hex', () => {
  it('same bytes → same hash', async () => {
    const buf = new TextEncoder().encode('hello world').buffer;
    const h1 = await sha256hex(buf);
    const h2 = await sha256hex(buf.slice(0));
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different bytes → different hash', async () => {
    const a = new TextEncoder().encode('aaa').buffer;
    const b = new TextEncoder().encode('bbb').buffer;
    expect(await sha256hex(a)).not.toBe(await sha256hex(b));
  });

  it('known value: empty buffer', async () => {
    const h = await sha256hex(new Uint8Array(0).buffer);
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
