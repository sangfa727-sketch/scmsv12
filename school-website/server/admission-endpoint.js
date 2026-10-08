'use strict';

const { resolveSchoolFromHost } = require('./hostname-resolver.js');
const {
  validateAdmissionInput,
  isHoneypotTriggered
} = require('./admission-security.js');
const {
  normalizeAdmissionPersistenceError
} = require('./admission-persistence.js');

/**
 * Framework-neutral admission request boundary.
 *
 * The caller supplies the trusted site registry, shared replay/rate-limit
 * guards, and an insert function. No Supabase client or service-role secret
 * is created here, keeping this module safe for sandbox contract testing.
 *
 * Production requirements:
 * - rateLimiter must be shared/infrastructure-backed, not process-local
 * - replay guard is an early-abuse filter only
 * - persistent unique (school_id, idempotency_key) is the final atomic guard
 * - insertApplication must execute the isolated admission transaction only
 */
async function handleAdmissionRequest({
  hostname,
  body,
  identity,
  siteRegistry,
  rootDomain,
  replayGuard,
  rateLimiter,
  insertApplication
}) {
  const site = resolveSchoolFromHost(hostname, siteRegistry, rootDomain);
  if (!site) return { status: 404, body: { ok: false, error: 'unknown_school' } };

  if (isHoneypotTriggered(body?.website)) {
    return { status: 400, body: { ok: false, error: 'invalid_request' } };
  }

  if (!rateLimiter || typeof rateLimiter.allow !== 'function' || typeof identity !== 'string' || !identity.trim()) {
    return { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } };
  }

  if (!rateLimiter.allow(identity.trim())) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } };
  }

  const validation = validateAdmissionInput(body);
  if (!validation.ok) {
    return { status: 400, body: { ok: false, error: validation.error } };
  }

  if (!replayGuard || typeof replayGuard.claim !== 'function') {
    return { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } };
  }

  if (!replayGuard.claim(site.schoolId + ':' + validation.value.idempotencyKey)) {
    return { status: 409, body: { ok: false, error: 'duplicate_request' } };
  }

  if (typeof insertApplication !== 'function') {
    return { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } };
  }

  try {
    await insertApplication({
      schoolId: site.schoolId,
      sourceHost: hostname,
      ...validation.value
    });
  } catch (error) {
    return normalizeAdmissionPersistenceError(error);
  }

  return { status: 201, body: { ok: true } };
}

module.exports = { handleAdmissionRequest };
