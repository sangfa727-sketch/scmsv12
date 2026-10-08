'use strict';

const { resolveSchoolFromHost } = require('./hostname-resolver.js');
const {
  validateAdmissionInput,
  isHoneypotTriggered
} = require('./admission-security.js');

/**
 * Framework-neutral admission request boundary.
 *
 * The caller supplies the trusted site registry, shared replay/rate-limit
 * guards, and an insert function. No Supabase client or service-role secret
 * is created here, keeping this module safe for sandbox contract testing.
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

  if (!rateLimiter || !rateLimiter.allow(identity || 'unknown')) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } };
  }

  const validation = validateAdmissionInput(body);
  if (!validation.ok) {
    return { status: 400, body: { ok: false, error: validation.error } };
  }

  if (!replayGuard || !replayGuard.claim(site.schoolId + ':' + validation.value.idempotencyKey)) {
    return { status: 409, body: { ok: false, error: 'duplicate_request' } };
  }

  if (typeof insertApplication !== 'function') {
    return { status: 503, body: { ok: false, error: 'admission_backend_unavailable' } };
  }

  await insertApplication({
    schoolId: site.schoolId,
    sourceHost: hostname,
    ...validation.value
  });

  return { status: 201, body: { ok: true } };
}

module.exports = { handleAdmissionRequest };
