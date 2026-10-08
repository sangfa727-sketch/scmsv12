const test = require('node:test');
const assert = require('node:assert/strict');

const { handleAdmissionRequest } = require('../../school-website/server/admission-endpoint.js');
const { createReplayGuard, createRateLimiter } = require('../../school-website/server/admission-security.js');

function setup() {
  return {
    siteRegistry: new Map([
      ['school-a', { schoolId: 'school-a', active: true }],
      ['school-b', { schoolId: 'school-b', active: true }]
    ]),
    rootDomain: 'scmsv12.com',
    replayGuard: createReplayGuard({ ttlMs: 60000, maxEntries: 100 }),
    rateLimiter: createRateLimiter({ windowMs: 60000, maxRequests: 3 })
  };
}

test('admission endpoint resolves school from trusted hostname and inserts only resolved tenant', async () => {
  const deps = setup();
  const inserted = [];

  const result = await handleAdmissionRequest({
    ...deps,
    hostname: 'school-a.scmsv12.com',
    identity: 'school-a:ip-1',
    body: {
      studentName: 'Student A',
      guardianName: 'Guardian A',
      phone: '09123456789',
      grade: 'Grade 5',
      idempotencyKey: 'admission-key-123456'
    },
    insertApplication: async (row) => inserted.push(row)
  });

  assert.equal(result.status, 201);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].schoolId, 'school-a');
  assert.equal(inserted[0].sourceHost, 'school-a.scmsv12.com');
});

test('admission endpoint rejects unknown or cross-school client selection', async () => {
  const deps = setup();
  let inserted = 0;

  const result = await handleAdmissionRequest({
    ...deps,
    hostname: 'school-a.scmsv12.com.evil.test',
    identity: 'attacker:ip-1',
    body: {
      studentName: 'Student',
      guardianName: 'Guardian',
      phone: '09123456789',
      grade: 'Grade 5',
      schoolId: 'school-b',
      idempotencyKey: 'admission-key-123456'
    },
    insertApplication: async () => { inserted += 1; }
  });

  assert.equal(result.status, 404);
  assert.equal(inserted, 0);
});

test('admission endpoint fails closed on honeypot, replay, and rate limit', async () => {
  const deps = setup();
  const base = {
    studentName: 'Student',
    guardianName: 'Guardian',
    phone: '09123456789',
    grade: 'Grade 5',
    idempotencyKey: 'admission-key-123456'
  };
  const insertApplication = async () => {};

  assert.equal((await handleAdmissionRequest({
    ...deps, hostname: 'school-a.scmsv12.com', identity: 'bot:1',
    body: { ...base, website: 'bot' }, insertApplication
  })).status, 400);

  assert.equal((await handleAdmissionRequest({
    ...deps, hostname: 'school-a.scmsv12.com', identity: 'user:1',
    body: base, insertApplication
  })).status, 201);

  assert.equal((await handleAdmissionRequest({
    ...deps, hostname: 'school-a.scmsv12.com', identity: 'user:1',
    body: base, insertApplication
  })).status, 409);

  assert.equal((await handleAdmissionRequest({
    ...deps, hostname: 'school-a.scmsv12.com', identity: 'user:1',
    body: { ...base, idempotencyKey: 'admission-key-222222' }, insertApplication
  })).status, 201);

  assert.equal((await handleAdmissionRequest({
    ...deps, hostname: 'school-a.scmsv12.com', identity: 'user:1',
    body: { ...base, idempotencyKey: 'admission-key-333333' }, insertApplication
  })).status, 429);
});
