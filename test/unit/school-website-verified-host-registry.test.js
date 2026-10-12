const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('custom host registry is private and fails closed until trusted verification', () => {
  const sql = read('supabase/migrations/20261012100000_school_website_verified_host_registry.sql');
  assert.match(sql, /create table if not exists public\.website_custom_domains/);
  assert.match(sql, /pending_verification/);
  assert.match(sql, /status in \('pending_verification','verified','active','suspended'\)/);
  assert.match(sql, /verified_at is not null/);
  assert.match(sql, /alter table public\.website_custom_domains enable row level security/i);
  assert.match(sql, /alter table public\.website_custom_domains force row level security/i);
  assert.match(sql, /using \(false\) with check \(false\)/i);
  assert.match(sql, /revoke all on public\.website_custom_domains from public, anon, authenticated/i);
  assert.match(sql, /trusted operator\/service/i);
});

test('public content is served only from a verified active platform subdomain or same-school custom domain', () => {
  const sql = read('supabase/migrations/20261012100000_school_website_verified_host_registry.sql');
  assert.match(sql, /s\.hostname = s\.site_slug \|\| '\.' \|\| s\.platform_domain/);
  assert.match(sql, /d\.active = true/);
  assert.match(sql, /d\.is_default = true/);
  assert.match(sql, /d\.verified_at is not null/);
  assert.match(sql, /c\.hostname = s\.hostname/);
  assert.match(sql, /c\.school_id = s\.school_id/);
  assert.match(sql, /c\.status = 'active'/);
  assert.match(sql, /c\.verified_at is not null/);
  assert.match(sql, /return jsonb_build_object\('ok', true, 'found', false\)/);
  assert.match(sql, /grant execute on function public\.rpc_school_website_get_published\(text\) to anon, authenticated/i);
});
