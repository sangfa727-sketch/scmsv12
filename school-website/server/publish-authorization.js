'use strict';

/**
 * Server-side Website Studio publication boundary.
 *
 * This module is database-agnostic and intentionally does not publish data.
 * A later repository adapter must perform the atomic persistence operation
 * after this authorization contract succeeds.
 */

const REVIEWABLE_STATUSES = new Set(['draft', 'review']);
const PUBLISHABLE_STATUSES = new Set(['review']);

function assertPublishContext(context) {
  if (!context || typeof context !== 'object') throw new TypeError('publish context required');
  if (typeof context.schoolId !== 'string' || !context.schoolId.trim()) {
    throw new Error('resolved school required');
  }
  if (typeof context.actorId !== 'string' || !context.actorId.trim()) {
    throw new Error('authorized actor required');
  }
  if (context.isWebsitePublisher !== true) {
    throw new Error('website publisher authorization required');
  }
  if (context.requestedSchoolId !== undefined && context.requestedSchoolId !== context.schoolId) {
    throw new Error('cross-school publish request rejected');
  }
  return { schoolId: context.schoolId.trim(), actorId: context.actorId.trim() };
}

function buildReviewTransition(draft, context) {
  const actor = assertPublishContext(context);
  if (!draft || typeof draft !== 'object') throw new TypeError('draft required');
  if (draft.schoolId !== actor.schoolId) throw new Error('cross-school draft rejected');
  if (!REVIEWABLE_STATUSES.has(draft.status)) throw new Error('invalid draft state');
  return { schoolId: actor.schoolId, actorId: actor.actorId, from: draft.status, to: 'review' };
}

function buildPublishTransition(draft, context) {
  const actor = assertPublishContext(context);
  if (!draft || typeof draft !== 'object') throw new TypeError('draft required');
  if (draft.schoolId !== actor.schoolId) throw new Error('cross-school draft rejected');
  if (!PUBLISHABLE_STATUSES.has(draft.status)) throw new Error('publish requires review state');
  return {
    schoolId: actor.schoolId,
    actorId: actor.actorId,
    from: 'review',
    to: 'published',
    publishedAtRequired: true
  };
}

module.exports = { assertPublishContext, buildReviewTransition, buildPublishTransition };
