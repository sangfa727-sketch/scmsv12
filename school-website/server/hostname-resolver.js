'use strict';

/**
 * Resolve the public school tenant from a trusted request hostname.
 *
 * The caller must supply the server-side site registry. A client-provided
 * school_id is intentionally not accepted as an override.
 */
const RESERVED_LABELS = new Set(['www', 'school', 'scms', 'localhost']);

function resolveSchoolFromHost(hostname, siteRegistry, rootDomain, requestedSchoolId = null) {
  if (typeof hostname !== 'string' || typeof rootDomain !== 'string') return null;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const root = rootDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!host || !root || host === root || !host.endsWith('.' + root)) return null;

  const suffix = '.' + root;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;

  const site = siteRegistry?.get?.(label);
  if (!site || site.active !== true || typeof site.schoolId !== 'string' || !site.schoolId) return null;
  if (requestedSchoolId !== null && requestedSchoolId !== site.schoolId) return null;

  return { schoolId: site.schoolId, siteKey: label };
}

module.exports = { resolveSchoolFromHost };