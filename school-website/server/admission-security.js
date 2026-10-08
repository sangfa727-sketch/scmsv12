'use strict';

const LIMITS = Object.freeze({ studentName: 120, guardianName: 120, phone: 40, email: 254, grade: 80, note: 2000, idempotencyKey: 128 });

function text(value, max) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized.length <= max ? normalized : '';
}

function validateAdmissionInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const value = {
    studentName: text(input.studentName, LIMITS.studentName),
    guardianName: text(input.guardianName, LIMITS.guardianName),
    phone: text(input.phone, LIMITS.phone),
    email: text(input.email, LIMITS.email),
    grade: text(input.grade, LIMITS.grade),
    note: text(input.note, LIMITS.note),
    idempotencyKey: text(input.idempotencyKey, LIMITS.idempotencyKey)
  };
  if (!value.studentName || !value.guardianName || !value.phone || !value.grade || !value.idempotencyKey) return { ok: false, error: 'required_field_missing' };
  if (value.email && !/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(value.email)) return { ok: false, error: 'invalid_email' };
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value.idempotencyKey)) return { ok: false, error: 'invalid_idempotency_key' };
  return { ok: true, value };
}

function isHoneypotTriggered(value) { return typeof value === 'string' && value.trim().length > 0; }

/**
 * In-memory replay guard for sandbox tests only; not production-grade.
 */
function createReplayGuard({ ttlMs = 10 * 60 * 1000, maxEntries = 10000, now = () => Date.now() } = {}) {
  const seen = new Map();
  return {
    claim(key) {
      const current = now();
      for (const [storedKey, expiresAt] of seen) {
        if (expiresAt <= current) seen.delete(storedKey);
      }
      if (seen.has(key)) return false;
      if (seen.size >= maxEntries) return false;
      seen.set(key, current + ttlMs);
      return true;
    }
  };
}

/**
 * In-memory rate limiter for sandbox tests only; not production-grade.
 */
function createRateLimiter({ windowMs = 60 * 1000, maxRequests = 10, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    allow(identity) {
      const current = now();
      const bucket = buckets.get(identity);
      if (!bucket || bucket.resetAt <= current) {
        buckets.set(identity, { count: 1, resetAt: current + windowMs });
        return true;
      }
      if (bucket.count >= maxRequests) return false;
      bucket.count += 1;
      return true;
    }
  };
}

module.exports = {
  LIMITS,
  validateAdmissionInput,
  isHoneypotTriggered,
  createReplayGuard,
  createRateLimiter
};
