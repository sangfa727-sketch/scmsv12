'use strict';

/**
 * Production admission persistence boundary.
 *
 * The database remains the source of truth for idempotency. The endpoint may
 * use a shared replay guard as an early-abuse filter, but duplicate protection
 * MUST also be enforced atomically by the unique (school_id, idempotency_key)
 * constraint in the isolated admission table.
 *
 * This module contains no database client and is safe for contract testing.
 */
function isAdmissionIdempotencyConflict(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.code === '23505' && typeof error.constraint === 'string') {
    return error.constraint === 'website_admission_school_idempotency_uniq';
  }
  return false;
}

function normalizeAdmissionPersistenceError(error) {
  if (isAdmissionIdempotencyConflict(error)) {
    return { status: 409, body: { ok: false, error: 'duplicate_request' } };
  }
  return { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } };
}

module.exports = {
  isAdmissionIdempotencyConflict,
  normalizeAdmissionPersistenceError
};
