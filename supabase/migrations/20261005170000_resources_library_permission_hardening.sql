-- SCMS v12 — Resources / Library authorization hardening
-- PR #97: keep library authorization server-side and session-bound.

create or replace function private.web_library_permission(
  p_session_token text,
  p_permission_key text,
  p_class_name text default null
) returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select private.web_has_permission(
    p_session_token,
    p_permission_key,
    nullif(trim(p_class_name), ''),
    null
  );
$$;

revoke all on function private.web_library_permission(text,text,text) from public, anon, authenticated;
grant execute on function private.web_library_permission(text,text,text) to postgres;

insert into public.permission_definitions(permission_key, scope_type, is_active)
values
  ('library.view', 'global', true),
  ('library.manage', 'global', true)
on conflict (permission_key) do update
  set scope_type = excluded.scope_type,
      is_active = true;

insert into public.role_permissions(role, permission_key, allowed)
select r.role, p.permission_key, true
from (values
  ('teacher'), ('assistant_teacher'), ('senior_teacher'),
  ('school_coordinator'), ('administrative_assistant')
) r(role)
cross join (values ('library.view')) p(permission_key)
on conflict (role, permission_key) do update set allowed = excluded.allowed;

insert into public.role_permissions(role, permission_key, allowed)
select r.role, p.permission_key, true
from (values ('admin'), ('super_admin')) r(role)
cross join (values ('library.view'), ('library.manage')) p(permission_key)
on conflict (role, permission_key) do update set allowed = excluded.allowed;

create or replace function public.rpc_get_books(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  if not private.web_library_permission(p_session_token, 'library.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  select s.teacher_id, s.school_id into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
  limit 1;

  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'title', b.title, 'author', b.author, 'isbn', b.isbn,
    'category', b.category, 'total_copies', b.total_copies,
    'available_copies', b.available_copies, 'notes', b.notes,
    'checked_out_count', coalesce(co.n,0)
  ) order by b.title), '[]'::jsonb)
  into v_rows
  from public.library_books b
  left join (
    select book_id, count(*) n from public.library_checkouts
    where returned_date is null group by book_id
  ) co on co.book_id=b.id
  where b.school_id=v_sess.school_id;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

create or replace function public.rpc_add_book(
  p_session_token text, p_title text, p_author text default null,
  p_isbn text default null, p_category text default null,
  p_total_copies integer default 1, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
  if not private.web_library_permission(p_session_token,'library.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_title is null or trim(p_title)='' then return jsonb_build_object('ok',false,'error','title_required'); end if;
  insert into public.library_books(school_id,title,author,isbn,category,total_copies,available_copies,notes)
  values(v_sess.school_id,trim(p_title),nullif(trim(p_author),''),nullif(trim(p_isbn),''),
         nullif(trim(p_category),''),greatest(coalesce(p_total_copies,1),0),
         greatest(coalesce(p_total_copies,1),0),nullif(trim(p_notes),''))
  returning * into v_row;
  return jsonb_build_object('ok',true,'book',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_update_book(
  p_session_token text, p_id bigint, p_title text default null,
  p_author text default null, p_isbn text default null, p_category text default null,
  p_total_copies integer default null, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record; v_checked_out int;
begin
  if not private.web_library_permission(p_session_token,'library.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select count(*) into v_checked_out from public.library_checkouts where book_id=p_id and returned_date is null;
  update public.library_books set
    title=coalesce(nullif(trim(p_title),''),title),
    author=case when p_author is null then author else nullif(trim(p_author),'') end,
    isbn=case when p_isbn is null then isbn else nullif(trim(p_isbn),'') end,
    category=case when p_category is null then category else nullif(trim(p_category),'') end,
    total_copies=coalesce(p_total_copies,total_copies),
    available_copies=case when p_total_copies is null then available_copies else greatest(p_total_copies-v_checked_out,0) end,
    notes=case when p_notes is null then notes else nullif(trim(p_notes),'') end
  where id=p_id and school_id=v_sess.school_id returning * into v_row;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  return jsonb_build_object('ok',true,'book',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_delete_book(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_n int; v_out int;
begin
  if not private.web_library_permission(p_session_token,'library.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select count(*) into v_out from public.library_checkouts where book_id=p_id and returned_date is null;
  if v_out>0 then return jsonb_build_object('ok',false,'error','has_active_checkouts'); end if;
  delete from public.library_books where id=p_id and school_id=v_sess.school_id;
  get diagnostics v_n=row_count;
  if v_n=0 then return jsonb_build_object('ok',false,'error','not_found'); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.rpc_get_book_checkouts(p_session_token text,p_book_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_rows jsonb;
begin
  if not private.web_library_permission(p_session_token,'library.view') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'student_id',c.student_id,'student_name',st.name_en,
    'checked_out_date',c.checked_out_date,'due_date',c.due_date,
    'returned_date',c.returned_date,'notes',c.notes
  ) order by c.checked_out_date desc,c.id desc),'[]'::jsonb)
  into v_rows
  from public.library_checkouts c join public.students st on st.student_id=c.student_id
  where c.book_id=p_book_id and c.school_id=v_sess.school_id;
  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

create or replace function public.rpc_checkout_book(
  p_session_token text,p_book_id bigint,p_student_id text,
  p_due_date date default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_book record; v_student record; v_row record;
begin
  if not private.web_library_permission(p_session_token,'library.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select * into v_book from public.library_books where id=p_book_id and school_id=v_sess.school_id for update;
  if v_book is null then return jsonb_build_object('ok',false,'error','book_not_found'); end if;
  select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id and status='Active' limit 1;
  if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found_or_inactive'); end if;
  if v_book.available_copies<=0 then return jsonb_build_object('ok',false,'error','no_copies_available'); end if;
  insert into public.library_checkouts(school_id,book_id,student_id,due_date,notes,created_by)
  values(v_sess.school_id,p_book_id,p_student_id,p_due_date,nullif(trim(p_notes),''),v_sess.teacher_id)
  returning * into v_row;
  update public.library_books set available_copies=available_copies-1 where id=p_book_id;
  return jsonb_build_object('ok',true,'checkout',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_return_book(p_session_token text,p_checkout_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
  if not private.web_library_permission(p_session_token,'library.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  update public.library_checkouts set returned_date=current_date
  where id=p_checkout_id and school_id=v_sess.school_id and returned_date is null returning * into v_row;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found_or_already_returned'); end if;
  update public.library_books set available_copies=available_copies+1 where id=v_row.book_id and school_id=v_sess.school_id;
  return jsonb_build_object('ok',true,'checkout',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_get_student_checkouts(p_session_token text,p_student_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_rows jsonb;
begin
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select * into v_student from public.students
  where student_id=p_student_id and school_id=v_sess.school_id limit 1;
  if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;

  if not private.web_has_permission(p_session_token,'students.view',nullif(trim(v_student.class),''),null) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  if not private.web_library_permission(p_session_token,'library.view') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'book_id',c.book_id,'title',b.title,
    'checked_out_date',c.checked_out_date,'due_date',c.due_date,'returned_date',c.returned_date
  ) order by c.checked_out_date desc),'[]'::jsonb)
  into v_rows
  from public.library_checkouts c join public.library_books b on b.id=c.book_id
  where c.student_id=p_student_id and c.school_id=v_sess.school_id;
  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

revoke execute on function public.rpc_get_books(text) from public;
grant execute on function public.rpc_get_books(text) to anon, authenticated;
revoke execute on function public.rpc_add_book(text,text,text,text,text,integer,text) from public;
grant execute on function public.rpc_add_book(text,text,text,text,text,integer,text) to anon, authenticated;
revoke execute on function public.rpc_update_book(text,bigint,text,text,text,text,integer,text) from public;
grant execute on function public.rpc_update_book(text,bigint,text,text,text,text,integer,text) to anon, authenticated;
revoke execute on function public.rpc_delete_book(text,bigint) from public;
grant execute on function public.rpc_delete_book(text,bigint) to anon, authenticated;
revoke execute on function public.rpc_get_book_checkouts(text,bigint) from public;
grant execute on function public.rpc_get_book_checkouts(text,bigint) to anon, authenticated;
revoke execute on function public.rpc_checkout_book(text,bigint,text,date,text) from public;
grant execute on function public.rpc_checkout_book(text,bigint,text,date,text) to anon, authenticated;
revoke execute on function public.rpc_return_book(text,bigint) from public;
grant execute on function public.rpc_return_book(text,bigint) to anon, authenticated;
revoke execute on function public.rpc_get_student_checkouts(text,text) from public;
grant execute on function public.rpc_get_student_checkouts(text,text) to anon, authenticated;
