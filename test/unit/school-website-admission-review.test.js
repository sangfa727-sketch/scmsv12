const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Website Studio exposes a private admission inbox and status controls', () => {
  const html = read('school-website/create.html');
  const js = read('school-website/create.js');
  const css = read('school-website/create.css');
  assert.match(html, /id="admissionInboxButton"/);
  assert.match(html, /id="admissionInboxDialog"/);
  assert.match(html, /id="admissionInboxList"/);
  assert.match(html, /admissionsAuthorized: result\.admissions_authorized === true/);
  assert.match(js, /rpc_school_website_list_admissions/);
  assert.match(js, /rpc_school_website_update_admission_status/);
  assert.match(js, /admissionsAuthorized!==true/);
  assert.match(js, /p_expected_updated_at/);
  assert.match(js, /stale_application/);
  assert.match(css, /\.admission-review-card/);
  assert.match(css, /\.admission-review-details/);
  new Function(js);
});

test('admission applicant content is rendered as text and not persisted in browser storage', () => {
  const js = read('school-website/create.js');
  const start = js.indexOf('function renderAdmissionCard(item)');
  const end = js.indexOf('function setAdmissionInboxStatus', start);
  assert.ok(start >= 0 && end > start);
  const renderer = js.slice(start, end);
  assert.match(renderer, /textContent/);
  assert.match(renderer, /createElement/);
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^\n]*admission/i);
});

test('admission review RPCs enforce school scope, dedicated sensitive permission, status transitions, and audit logging', () => {
  const sql = read('supabase/migrations/20261011170000_school_website_admission_review.sql');
  assert.match(sql, /private\.web_has_permission\(p_session_token, 'website\.admissions\.review'/);
  assert.match(sql, /a\.school_id = v_actor\.school_id/);
  assert.match(sql, /school_id = v_actor\.school_id/);
  assert.match(sql, /p_expected_updated_at/);
  assert.match(sql, /stale_application/);
  assert.match(sql, /invalid_status_transition/);
  assert.match(sql, /application_closed/);
  assert.match(sql, /website\.admission_status_changed/);
  assert.match(sql, /is_sensitive = true/);
  assert.match(sql, /grant execute on function public\.rpc_school_website_list_admissions[\s\S]*?to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rpc_school_website_update_admission_status[\s\S]*?to anon, authenticated/i);
});
