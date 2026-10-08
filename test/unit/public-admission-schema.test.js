const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test('public admission schema has school-scoped durable idempotency', () => {
  const sql = fs.readFileSync(
    path.join(ROOT, 'school-website/db/website_admission_schema.sql'),
    'utf8'
  );

  assert.match(sql, /idempotency_key text not null/i);
  assert.match(sql, /char_length\(trim\(idempotency_key\)\) between 16 and 128/i);
  assert.match(
    sql,
    /constraint website_admission_school_idempotency_uniq unique \(school_id, idempotency_key\)/i
  );
  assert.match(sql, /enforce idempotency atomically/i);
  assert.match(sql, /NOT the Student Core/i);
  assert.doesNotMatch(sql, /grant select to anon/i);
  assert.doesNotMatch(sql, /grant update to anon/i);
  assert.doesNotMatch(sql, /grant delete to anon/i);
});
