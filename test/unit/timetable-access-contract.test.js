import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20261007143000_timetable_access_scope.sql'),
  'utf8'
);

test('timetable permissions are class-scoped', () => {
  assert.ok(migration.includes("'timetable.view'"));
  assert.ok(migration.includes("'timetable.edit'"));
  assert.ok(migration.includes("'class'"));
});

test('timetable reads enforce view permission by class', () => {
  assert.match(migration, 
    /rpc_get_timetable[\s\S]*web_has_permission\([\s\S]*'timetable\.view'[\s\S]*trim\(class\)/
  );
});

test('timetable create enforces edit permission by requested class', () => {
  assert.match(migration, 
    /rpc_save_timetable[\s\S]*web_has_permission\([\s\S]*'timetable\.edit'[\s\S]*v_class/
  );
});

test('timetable update checks old and new class scope', () => {
  const update = migration.slice(migration.indexOf('create or replace function public.rpc_update_timetable'));
  assert.ok(update.includes("'timetable.edit'"));
  assert.ok(update.includes('v_old.class'));
  assert.ok(update.includes('v_new_class'));
  assert.ok(update.includes('permission_denied'));
});

test('timetable delete checks target class scope', () => {
  const del = migration.slice(migration.indexOf('create or replace function public.rpc_delete_timetable'));
  assert.ok(del.includes("'timetable.edit'"));
  assert.ok(del.includes('v_row.class'));
  assert.ok(del.includes('permission_denied'));
});

test('browser execute grants remain explicit', () => {
  assert.ok(migration.includes('grant execute on function public.rpc_get_timetable(text) to anon,authenticated'));
  assert.ok(migration.includes('grant execute on function public.rpc_save_timetable(text,text,integer,time,text,text,text) to anon,authenticated'));
  assert.ok(migration.includes('grant execute on function public.rpc_update_timetable(text,bigint,text,integer,time,text,text,text) to anon,authenticated'));
  assert.ok(migration.includes('grant execute on function public.rpc_delete_timetable(text,bigint) to anon,authenticated'));
});
