const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Website Studio loads and saves authorized drafts through the versioned backend', () => {
  const js = read('school-website/create.js');
  const sql = read('supabase/migrations/20261011180000_school_website_persistent_drafts.sql');
  assert.match(js, /rpc_school_website_load_draft/);
  assert.match(js, /rpc_school_website_save_draft/);
  assert.match(js, /p_expected_version:draftVersion/);
  assert.match(js, /stale_draft/);
  assert.match(js, /Saved to SCMS/);
  assert.match(js, /Offline backup only/);
  assert.match(sql, /school_id text not null unique/);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /private\.web_has_permission\(p_session_token, 'website\.manage'/);
  assert.match(sql, /version = version \+ 1/);
  assert.match(sql, /stale_draft/);
  new Function(js);
});

test('draft normalization bounds text and collections, drops client logo data, and locks the hero section', () => {
  const sql = read('supabase/migrations/20261011180000_school_website_persistent_drafts.sql');
  assert.match(sql, /char_length|left\(btrim/);
  assert.match(sql, /limit 50/);
  assert.match(sql, /limit 30/);
  assert.match(sql, /'locked', section_type = 'hero'/);
  assert.match(sql, /'programs', v_programs/);
  assert.doesNotMatch(sql, /'logo',\s*p_content->>'logo'/i);
});

test('website draft storage cannot be accessed directly by browser roles', () => {
  const sql = read('supabase/migrations/20261011180000_school_website_persistent_drafts.sql');
  assert.match(sql, /revoke all on public\.website_drafts from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.rpc_school_website_load_draft\(text\) from public/i);
  assert.match(sql, /grant execute on function public\.rpc_school_website_load_draft\(text\) to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rpc_school_website_save_draft\(text,jsonb,integer\) to anon, authenticated/i);
});
