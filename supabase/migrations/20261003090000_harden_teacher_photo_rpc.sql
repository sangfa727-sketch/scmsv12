create or replace function public.rpc_set_teacher_photo(p_session_token text, p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_teacher public.teachers%rowtype;
begin
  select s.teacher_id, s.school_id into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
   limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  update public.teachers set photo_url=p_photo_url
   where teacher_id=v_sess.teacher_id and school_id=v_sess.school_id
   returning * into v_teacher;
  if v_teacher is null then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;
  return jsonb_build_object('ok',true,'teacher',jsonb_build_object('teacher_id',v_teacher.teacher_id,'teacher_name',v_teacher.teacher_name,'login_name',v_teacher.login_name,'role',v_teacher.role,'status',v_teacher.status,'email',v_teacher.email,'photo_url',v_teacher.photo_url));
end;
$function$;
