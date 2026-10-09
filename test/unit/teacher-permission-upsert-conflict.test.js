const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('teacher permission upsert conflict target matches tenant-scoped expression index', () => {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261009160000_fix_teacher_permission_upsert_conflict.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /create unique index teacher_permissions_scope_uq\s+on public\.teacher_permissions\s*\(\s*school_id,\s*teacher_id,\s*permission_key,\s*scope_type,\s*\(coalesce\(class_name, ''\)\),\s*\(coalesce\(subject_id, 0\)\)\s*\)/i);
  assert.match(sql, /on conflict\s*\(\s*school_id,\s*teacher_id,\s*permission_key,\s*scope_type,\s*\(coalesce\(class_name, ''\)\),\s*\(coalesce\(subject_id, 0\)\)\s*\)\s*do update set allowed=excluded\.allowed,updated_at=now\(\)/i);
  assert.match(sql, /where school_id=v_admin\.school_id and teacher_id=p_teacher_id/i);
  assert.match(sql, /revoke execute on function public\.rpc_manage_teacher_access/i);
  assert.match(sql, /grant execute on function public\.rpc_manage_teacher_access/i);
});
