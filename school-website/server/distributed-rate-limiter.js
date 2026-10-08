'use strict';

/**
 * Production distributed rate-limit boundary.
 *
 * This module defines the contract for a shared/infrastructure-backed limiter.
 * It intentionally contains no process-local state and no database/client
 * credentials. A production adapter must provide atomic allow semantics.
 */
const MAX_IDENTITY_LENGTH = 256;

function normalizeIdentity(identity) {
  if (typeof identity !== 'string') return null;
  const value = identity.trim();
  if (!value || value.length > MAX_IDENTITY_LENGTH) return null;
  return value;
}

function createDistributedRateLimiter({ allow }) {
  if (typeof allow !== 'function') {
    throw new TypeError('distributed_rate_limiter_adapter_required');
  }

  return Object.freeze({
    async allow(identity) {
      const normalized = normalizeIdentity(identity);
      if (!normalized) return false;
      const result = await allow(normalized);
      return result === true;
    }
  });
}

module.exports = {
  MAX_IDENTITY_LENGTH,
  normalizeIdentity,
  createDistributedRateLimiter
};
