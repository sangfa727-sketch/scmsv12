const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Website Studio exposes a subdomain reservation dialog and shows server-derived status', () => {
  const html = read('school-website/create.html');
  const js = read('school-website/create.js');
  const css = read('school-website/create.css');
  assert.match(html, /id="siteAddressButton"/);
  assert.match(html, /id="siteAddressDialog"/);
  assert.match(html, /id="siteSlugInput"/);
  assert.match(html, /id="reserveSiteAddress"/);
  assert.match(html, /id="activateSiteAddress"/);
  assert.match(js, /rpc_school_website_get_site/);
  assert.match(js, /rpc_school_website_provision_subdomain/);
  assert.match(js, /rpc_school_website_activate_site/);
  assert.match(js, /platform_domain_not_configured/);
  assert.match(js, /publishAuthorized/);
  assert.match(css, /\.site-address-dialog/);
  new Function(js);
});

test('subdomain provisioning requires a verified platform-owned root domain and keeps new sites inactive', () => {
  const sql = read('supabase/migrations/20261011200000_school_website_subdomain_provisioning.sql');
  assert.match(sql, /create table if not exists public\.website_platform_domains/);
  assert.match(sql, /verified_at is not null/);
  assert.match(sql, /website_platform_domains_one_active_default/);
  assert.match(sql, /platform_domain_not_configured/);
  assert.match(sql, /invalid_slug/);
  assert.match(sql, /hostname_unavailable/);
  assert.match(sql, /site_already_provisioned/);
  assert.match(sql, /values\s*\(\s*v_actor\.school_id,\s*v_hostname,\s*false,\s*v_slug,\s*v_base_domain,\s*'pending_activation'/);
  assert.match(sql, /revoke all on public\.website_platform_domains from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /insert into public\.website_platform_domains\s*\(\s*base_domain/i);
});

test('site activation requires publication and publish permission, and writes an audit event', () => {
  const sql = read('supabase/migrations/20261011200000_school_website_subdomain_provisioning.sql');
  assert.match(sql, /private\.web_has_permission\(p_session_token, 'website\.publish'/);
  assert.match(sql, /publication_required/);
  assert.match(sql, /provisioning_status = 'active'/);
  assert.match(sql, /website\.site_reserved/);
  assert.match(sql, /website\.site_activated/);
  assert.match(sql, /grant execute on function public\.rpc_school_website_activate_site\(text\) to anon, authenticated/i);
});
