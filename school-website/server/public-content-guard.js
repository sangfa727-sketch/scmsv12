'use strict';

/**
 * Deterministic public-content authorization helper.
 * This is a pure boundary layer for server/API code; it performs no database access.
 */
function selectPublishedForSchool(rows, schoolId) {
  if (!Array.isArray(rows) || typeof schoolId !== 'string' || !schoolId) return [];
  return rows.filter((row) =>
    row &&
    row.school_id === schoolId &&
    row.publication_status === 'published'
  );
}

function assertPublicContentRequest(context) {
  if (!context || typeof context.schoolId !== 'string' || !context.schoolId) {
    throw new Error('public school tenant is required');
  }
  if (context.requestedSchoolId !== undefined && context.requestedSchoolId !== context.schoolId) {
    throw new Error('cross-school public content request rejected');
  }
  return context.schoolId;
}

module.exports = { selectPublishedForSchool, assertPublicContentRequest };