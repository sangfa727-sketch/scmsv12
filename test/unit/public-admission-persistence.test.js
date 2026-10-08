const test = require('node:test');
const assert = require('node:assert/strict');

const persistence = require('../../school-website/server/admission-persistence.js');
const { handleAdmissionRequest } = require('../../school-website/server/admission-endpoint.js');

const sites = new Map([
  ['school-a', { schoolId: 'school-a', active: true }]
]);

const validBody = {
  studentName: 'Student A',
  guardianName: 'Guardian A',
  phone: '09123456789',
  grade: 'Grade 5',
  idempotencyKey: 'admission-key-123456'
};

function guards() {
  return {
    replayGuard: { claim: () => true },
    rateLimiter: { allow: () => true }
  };
}

test('persistent admission duplicate constraint maps to a safe 409 response', () => {
  assert.equal(
    persistence.isAdmissionIdempotencyConflict({
      code: '23505',
      constraint: 'website_admission_school_idempotency_uniq'
    }),
    true
  );
  assert.deepEqual(
    persistence.normalizeAdmissionPersistenceError({
      code: '23505',
      constraint: 'website_admission_school_idempotency_uniq'
    }),
    { status: 409, body: { ok: false, error: 'duplicate_request' } }
  );
});

test('unrelated database errors remain sanitized as 503', () => {
  assert.equal(
    persistence.isAdmissionIdempotencyConflict({
      code: '23505',
      constraint: 'other_unique_constraint'
    }),
    false
  );
  assert.deepEqual(
    persistence.normalizeAdmissionPersistenceError(new Error('private database detail')),
    { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } }
  );
});

test('endpoint maps atomic database idempotency conflicts to 409', async () => {
  const result = await handleAdmissionRequest({
    hostname: 'school-a.scmsv12.com',
    body: validBody,
    identity: 'ip:127.0.0.1',
    siteRegistry: sites,
    rootDomain: 'scmsv12.com',
    ...guards(),
    insertApplication: async () => {
      throw {
        code: '23505',
        constraint: 'website_admission_school_idempotency_uniq'
      };
    }
  });

  assert.deepEqual(result, {
    status: 409,
    body: { ok: false, error: 'duplicate_request' }
  });
});

test('endpoint never exposes database error details', async () => {
  const result = await handleAdmissionRequest({
    hostname: 'school-a.scmsv12.com',
    body: validBody,
    identity: 'ip:127.0.0.1',
    siteRegistry: sites,
    rootDomain: 'scmsv12.com',
    ...guards(),
    insertApplication: async () => {
      throw {
        code: 'XX000',
        detail: 'sensitive internal database detail'
      };
    }
  });

  assert.deepEqual(result, {
    status: 503,
    body: { ok: false, error: 'admission_backend_unavailable' }
  });
});
