const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_IDENTITY_LENGTH,
  normalizeIdentity,
  createDistributedRateLimiter
} = require('../../school-website/server/distributed-rate-limiter.js');

test('normalizes valid distributed limiter identity', () => {
  assert.equal(normalizeIdentity('  ip:127.0.0.1  '), 'ip:127.0.0.1');
});

test('rejects missing or oversized identity', () => {
  assert.equal(normalizeIdentity(''), null);
  assert.equal(normalizeIdentity('x'.repeat(MAX_IDENTITY_LENGTH + 1)), null);
  assert.equal(normalizeIdentity(null), null);
});

test('requires an external shared limiter adapter', () => {
  assert.throws(
    () => createDistributedRateLimiter({}),
    /distributed_rate_limiter_adapter_required/
  );
});

test('delegates normalized identity to the shared adapter', async () => {
  const calls = [];
  const limiter = createDistributedRateLimiter({
    allow: async (identity) => {
      calls.push(identity);
      return true;
    }
  });

  assert.equal(await limiter.allow('  school-a:ip:127.0.0.1  '), true);
  assert.deepEqual(calls, ['school-a:ip:127.0.0.1']);
});

test('fails closed when shared adapter denies or returns a non-boolean result', async () => {
  const denied = createDistributedRateLimiter({ allow: async () => false });
  const invalid = createDistributedRateLimiter({ allow: async () => 'allow' });

  assert.equal(await denied.allow('school-a:ip:127.0.0.1'), false);
  assert.equal(await invalid.allow('school-a:ip:127.0.0.1'), false);
});

test('fails closed for invalid identities without calling the adapter', async () => {
  let called = false;
  const limiter = createDistributedRateLimiter({
    allow: async () => {
      called = true;
      return true;
    }
  });

  assert.equal(await limiter.allow(''), false);
  assert.equal(called, false);
});
