'use strict';

/**
 * Persistent Website Studio draft boundary.
 *
 * This module is deliberately database-agnostic. It validates the shape and
 * tenant context before a later authorized repository adapter persists data.
 * It must never be used as a public website read path.
 */

const TEMPLATE_KEYS = new Set(['modern', 'classic', 'premium']);
const STATUSES = new Set(['draft', 'review']);
const LIMITS = Object.freeze({
  schoolName: 200,
  tagline: 300,
  aboutTitle: 200,
  aboutText: 4000,
  contactTitle: 200,
  contactText: 2000,
  collectionItem: 200,
  collectionCount: 50
});

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanCollection(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.collectionCount)
    .map(item => cleanText(item, LIMITS.collectionItem))
    .filter(Boolean);
}

function normalizeDraft(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('draft must be an object');
  }

  const template = input.template;
  if (!TEMPLATE_KEYS.has(template)) throw new TypeError('invalid template');

  return {
    template,
    schoolName: cleanText(input.schoolName, LIMITS.schoolName),
    tagline: cleanText(input.tagline, LIMITS.tagline),
    aboutTitle: cleanText(input.aboutTitle, LIMITS.aboutTitle),
    aboutText: cleanText(input.aboutText, LIMITS.aboutText),
    contactTitle: cleanText(input.contactTitle, LIMITS.contactTitle),
    contactText: cleanText(input.contactText, LIMITS.contactText),
    programs: cleanCollection(input.programs),
    facilities: cleanCollection(input.facilities),
    news: cleanCollection(input.news)
  };
}

function assertDraftWriteContext(context) {
  if (!context || typeof context !== 'object') throw new TypeError('write context required');
  if (typeof context.schoolId !== 'string' || !context.schoolId.trim()) {
    throw new Error('resolved school required');
  }
  if (typeof context.actorId !== 'string' || !context.actorId.trim()) {
    throw new Error('authorized actor required');
  }
  if (context.isWebsiteEditor !== true) {
    throw new Error('website editor authorization required');
  }
  if (context.requestedSchoolId !== undefined && context.requestedSchoolId !== context.schoolId) {
    throw new Error('cross-school draft request rejected');
  }
  return {
    schoolId: context.schoolId.trim(),
    actorId: context.actorId.trim()
  };
}

function buildDraftRecord(input, context, status = 'draft') {
  if (!STATUSES.has(status)) throw new TypeError('invalid draft status');
  const writeContext = assertDraftWriteContext(context);
  return {
    schoolId: writeContext.schoolId,
    actorId: writeContext.actorId,
    status,
    content: normalizeDraft(input)
  };
}

module.exports = {
  LIMITS,
  normalizeDraft,
  assertDraftWriteContext,
  buildDraftRecord
};
