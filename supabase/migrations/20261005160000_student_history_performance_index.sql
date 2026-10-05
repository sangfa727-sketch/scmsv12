-- SCMS v12 — Student history performance index
-- Targets the exact lookup used by rpc_get_student_history:
--   school_id + payload->>'student_id' + newest-first timestamp.
-- No production deployment is performed by this migration commit.
create index if not exists idx_audit_student_history
  on public.audit_log (
    school_id,
    ((payload ->> 'student_id')),
    ts desc
  )
  where (payload ->> 'student_id') is not null;

analyze public.audit_log;
