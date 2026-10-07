import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20261007143000_timetable_access_scope.sql'),
  'utf8'
);

test('timetable permissions are class-scoped', () => {
  expect(migration).toContain("'timetable.view'");
  expect(migration).toContain("'timetable.edit'");
  expect(migration).toContain("'class'");
});

test('timetable reads enforce view permission by class', () => {
  expect(migration).toMatch(
    /rpc_get_timetable[\s\S]*web_has_permission\([\s\S]*'timetable\.view'[\s\S]*trim\(class\)/
  );
});

test('timetable create enforces edit permission by requested class', () => {
  expect(migration).toMatch(
    /rpc_save_timetable[\s\S]*web_has_permission\([\s\S]*'timetable\.edit'[\s\S]*v_class/
  );
});

test('timetable update checks old and new class scope', () => {
  const update = migration.slice(migration.indexOf('create or replace function public.rpc_update_timetable'));
  expect(update).toContain("'timetable.edit'");
  expect(update).toContain('v_old.class');
  expect(update).toContain('v_new_class');
  expect(update).toContain('permission_denied');
});

test('timetable delete checks target class scope', () => {
  const del = migration.slice(migration.indexOf('create or replace function public.rpc_delete_timetable'));
  expect(del).toContain("'timetable.edit'");
  expect(del).toContain('v_row.class');
  expect(del).toContain('permission_denied');
});

test('browser execute grants remain explicit', () => {
  expect(migration).toContain('grant execute on function public.rpc_get_timetable(text) to anon,authenticated');
  expect(migration).toContain('grant execute on function public.rpc_save_timetable(text,text,integer,time,text,text,text) to anon,authenticated');
  expect(migration).toContain('grant execute on function public.rpc_update_timetable(text,bigint,text,integer,time,text,text,text) to anon,authenticated');
  expect(migration).toContain('grant execute on function public.rpc_delete_timetable(text,bigint) to anon,authenticated');
});
