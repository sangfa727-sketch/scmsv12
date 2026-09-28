const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('all primary page shells and list mount points remain present', () => {
  const html = read('index.html');
  const required = [
    ['page-dashboard', 'dashboardContent'],
    ['page-leave', 'leaveRequestsContent'],
    ['page-students', 'studentList'],
    ['page-attend', 'attendList'],
    ['page-daily', 'dailyList'],
    ['page-hw', 'hwList'],
    ['page-grades', 'gradesAssessmentList'],
    ['page-billing', 'billingInvoiceList'],
    ['page-admissions', 'admissionsList'],
    ['page-library', 'libraryList'],
    ['page-transport', 'transportList'],
    ['page-parents', 'commsList'],
    ['page-incidents', 'incidentList'],
    ['page-timetable', 'timetableList'],
    ['page-summary', 'summaryList'],
    ['page-more', 'moreMenu'],
    ['page-chat', 'chatRoot']
  ];

  for (const [pageId, mountId] of required) {
    assert.match(html, new RegExp('id="' + pageId + '"'), pageId);
    assert.match(html, new RegExp('id="' + mountId + '"'), mountId);
  }
});

test('primary navigation still exposes the core page routes', () => {
  const html = read('index.html');
  for (const page of [
    'students', 'attend', 'daily', 'hw', 'grades', 'billing',
    'admissions', 'library', 'transport', 'parents', 'incidents',
    'timetable', 'summary', 'more'
  ]) {
    assert.match(html, new RegExp('data-page="' + page + '"'), page);
  }
});

test('responsive list-card overflow guard remains scoped to list cards', () => {
  const css = read('action-alignment.css');
  assert.match(css, /\.list-card \.card-row[\s\S]*min-width:\s*0\s*!important/);
  assert.match(css, /\.list-card \.card-info[\s\S]*overflow:\s*hidden\s*!important/);
  assert.match(css, /\.list-card \.card-actions[\s\S]*width:\s*auto\s*!important/);
  assert.match(css, /\.list-card \.card-actions > \.icon-btn-mini[\s\S]*width:\s*30px\s*!important/);
});

test('Burmese card-title wrapping is not forced into arbitrary character breaks', () => {
  const css = read('style.css');
  assert.match(css, /\.card-name\s*\{[\s\S]{0,220}overflow-wrap:\s*normal;[\s\S]{0,120}word-break:\s*normal;/);
});
