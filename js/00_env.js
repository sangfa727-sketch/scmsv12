/**
 * SCMS v12 — deployment environment boundary.
 *
 * This file is intentionally small and contains NO credentials.
 * Production is the safe default for an unknown hosted hostname.
 *
 * Rules:
 * - localhost/127.0.0.1/::1 => development (backend disabled; demo/local work only)
 * - hostnames explicitly containing staging/preview/test/dev => staging (backend
 *   remains disabled unless a deployment injects a dedicated staging config)
 * - everything else => production
 *
 * Do not use a URL query parameter to select an environment.
 * This value is a deployment selector, not an authorization boundary.
 * The backend/database must remain isolated independently.
 */
'use strict';

(function initSCMSEnvironment(root) {
  if (root.SCMS_ENV) return;

  const host = String(root.location?.hostname || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const looksNonProduction = /(^|[.-])(staging|preview|test|dev)([.-]|$)/i.test(host);

  const mode = isLocal ? 'development' : (looksNonProduction ? 'staging' : 'production');

  root.SCMS_ENV = Object.freeze({
    mode,
    isDevelopment: mode === 'development',
    isStaging: mode === 'staging',
    isProduction: mode === 'production',
  });
})(window);
