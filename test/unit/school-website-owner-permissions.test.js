const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('website.manage is granted only to explicit owner/admin role aliases by default', () => {
  const file = path.resolve(__dirname, '../../supabase/migrations/20261009100000_school_website_manage_permission.sql');
  const sql = fs.readFileSync(file, 'utf8');
  assert.match(sql, /'website\.manage'/);
  for (const role of ['owner', 'school_owner', 'admin', 'super_admin']) {
    assert.match(sql, new RegExp("'" + role + "',\\s*'website\\.manage',\\s*true"));
  }
  assert.doesNotMatch(sql, /'teacher',\s*'website\.manage',\s*true/i);
});
