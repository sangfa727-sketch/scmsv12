const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Website Studio exposes review and publish actions only when their server capabilities allow it', () => {
  const html = read('school-website/create.html');
  const js = read('school-website/create.js');
  const sql = read('supabase/migrations/20261011190000_school_website_publish_and_public_read.sql');
  assert.match(html, /id="submitReviewButton"/);
  assert.match(html, /publishAuthorized: result\.publish_authorized === true/);
  assert.match(js, /rpc_school_website_submit_draft_for_review/);
  assert.match(js, /rpc_school_website_publish_draft/);
  assert.match(js, /draftStatus!=="review"/);
  assert.match(sql, /website\.publish/);
  assert.match(sql, /v_publish_authorized/);
  assert.match(sql, /review_required/);
  assert.match(sql, /incomplete_draft/);
  assert.match(sql, /incomplete_publication/);
  assert.match(sql, /stale_draft/);
  new Function(js);
});

test('public renderer loads only the published snapshot resolved from the current hostname', () => {
  const html = read('school-website/index.html');
  const js = read('school-website/app.js');
  const sql = read('supabase/migrations/20261011190000_school_website_publish_and_public_read.sql');
  assert.match(html, /name="scms-public-website-api-base"/);
  assert.match(html, /name="scms-public-website-anon-key"/);
  assert.match(js, /rpc_school_website_get_published/);
  assert.match(js, /p_hostname:host/);
  assert.match(js, /credentials:"omit"/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML/);
  assert.match(sql, /join public\.website_publications p on p\.school_id = s\.school_id/);
  assert.match(sql, /s\.hostname = v_hostname/);
  assert.match(sql, /s\.active = true/);
  assert.match(sql, /'found', true/);
  assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.rpc_school_website_get_published'), sql.indexOf('revoke all on function public.rpc_school_website_submit_draft_for_review')), /'school_id',/);
  new Function(js);
});

test('publication snapshots are private tables with a public-only RPC surface', () => {
  const sql = read('supabase/migrations/20261011190000_school_website_publish_and_public_read.sql');
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on public\.website_publications from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rpc_school_website_get_published\(text\) to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rpc_school_website_publish_draft\(text,integer\) to anon, authenticated/i);
  assert.match(sql, /website\.publish/);
  assert.match(sql, /website\.review_requested/);
  assert.match(sql, /website\.publish/);
});
