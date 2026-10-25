import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBypass } from '../src/bypass.ts';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k: string) => data.get(k) ?? null,
    set: async (k: string, v: string) => void data.set(k, v),
    delete: async (k: string) => void data.delete(k),
  };
}

test('nothing is known until the reviewer types it in', async () => {
  const bypass = createBypass(memoryStore());
  assert.equal(await bypass.load(), null);
  assert.equal(bypass.current(), null);
});

test('a typed bypass is kept on the phone, trimmed, across launches', async () => {
  const store = memoryStore();
  await createBypass(store).save('  abc123  ');
  const next = createBypass(store);
  assert.equal(await next.load(), 'abc123');
  assert.equal(next.current(), 'abc123');
});

test('an empty bypass is refused', async () => {
  const store = memoryStore();
  await assert.rejects(createBypass(store).save('   '), /empty/);
  assert.equal(store.data.size, 0);
});

test('a refused bypass is forgotten, and whoever shows the screen hears it', async () => {
  const store = memoryStore();
  const bypass = createBypass(store);
  await bypass.save('stale');
  const heard: Array<string | null> = [];
  bypass.subscribe((value) => heard.push(value));
  await bypass.clear();
  assert.equal(bypass.current(), null);
  assert.equal(store.data.size, 0);
  assert.deepEqual(heard, [null]);
});
