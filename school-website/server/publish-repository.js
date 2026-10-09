'use strict';

/**
 * Database-agnostic persistence contract for publishing a reviewed website draft.
 * This module does not connect to a database and does not publish by itself.
 *
 * A production adapter must execute the returned operation atomically:
 * 1. verify the reviewed draft belongs to the resolved school;
 * 2. materialize only public website content;
 * 3. mark/record the publication;
 * 4. write the publication audit;
 * 5. commit as one transaction.
 */

const PUBLIC_FIELDS = Object.freeze([
  'schoolName',
  'tagline',
  'aboutTitle',
  'aboutText',
  'contactTitle',
  'contactText',
  'programs',
  'facilities',
  'news'
]);

function assertPublishRepositoryInput(input) {
  if (!input || typeof input !== 'object') throw new TypeError('publish input required');
  if (!input.draft || typeof input.draft !== 'object') throw new TypeError('reviewed draft required');
  if (input.draft.status !== 'review') throw new Error('only reviewed drafts can be persisted');
  if (typeof input.draft.schoolId !== 'string' || !input.draft.schoolId.trim()) {
    throw new Error('draft school required');
  }
  if (!input.context || input.context.schoolId !== input.draft.schoolId) {
    throw new Error('resolved school mismatch');
  }
  if (input.context.isWebsitePublisher !== true) {
    throw new Error('website publisher authorization required');
  }
  if (typeof input.draft.draftId !== 'string' || !input.draft.draftId.trim()) {
    throw new Error('draft id required');
  }
  return true;
}

function buildAtomicPublishOperation(input) {
  assertPublishRepositoryInput(input);
  const content = input.draft.content || {};
  const publicContent = {};
  for (const key of PUBLIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(content, key)) publicContent[key] = content[key];
  }
  return Object.freeze({
    schoolId: input.draft.schoolId,
    draftId: input.draft.draftId,
    templateKey: input.draft.templateKey,
    publicContent,
    requireAtomicTransaction: true,
    auditAction: 'publish',
    publicStatus: 'published'
  });
}

module.exports = { PUBLIC_FIELDS, assertPublishRepositoryInput, buildAtomicPublishOperation };
