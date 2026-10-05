const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20261005310000_transport_route_permission_gates.sql',
  'utf8'
);

assert.match(migration, /'transport\.view'/);
assert.match(migration, /'transport\.manage'/);
assert.match(migration, /'admin', 'transport\.view', true/);
assert.match(migration, /'super_admin', 'transport\.manage', true/);
assert.match(migration, /'teacher', 'transport\.manage', false/);

for (const fn of [
  'rpc_get_routes',
  'rpc_get_route_detail',
  'rpc_add_route',
  'rpc_update_route',
  'rpc_delete_route'
]) {
  assert.match(migration, new RegExp('CREATE OR REPLACE FUNCTION public\\.' + fn + '\\('));
  assert.match(migration, new RegExp('private\\.web_has_permission\\(p_session_token, \'transport\\.(view|manage)\''));
  assert.match(migration, /t\.school_id = s\.school_id/);
  assert.match(migration, /invalid_session/);
}

assert.match(migration, /r\.school_id = v_sess\.school_id/);
assert.match(migration, /id = p_route_id AND school_id = v_sess\.school_id/);
assert.match(migration, /VALUES \(v_sess\.school_id/);
assert.match(migration, /WHERE id = p_id AND school_id = v_sess\.school_id/);
