-- Align production report-card authorization with PR #142's dedicated class-scoped permission model.
insert into public.permission_definitions(permission_key,category,description,scope_type,is_active)
values ('report_card.view','academic','View report cards for assigned classes','class',true)
on conflict(permission_key) do update
set category=excluded.category, description=excluded.description, scope_type=excluded.scope_type, is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,'report_card.view',true
from (values ('teacher'),('assistant_teacher'),('senior_teacher'),('school_coordinator'),('administrative_assistant'),('admin'),('super_admin')) r(role)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_get_report_card(
  p_session_token text,
  p_term_id bigint,
  p_class text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions','pg_temp'
as $function$
declare v_sess record; v_result jsonb;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;

  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_class is null or trim(p_class)='' then return jsonb_build_object('ok',false,'error','class_required'); end if;

  if not private.web_has_permission(p_session_token,'report_card.view',trim(p_class),null) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if p_term_id is not null and not exists (
    select 1 from public.terms where id=p_term_id and school_id=v_sess.school_id
  ) then return jsonb_build_object('ok',false,'error','term_not_found'); end if;

  with subject_avg as (
    select st.student_id,a.subject_id,sub.subject_name,
      round(sum(g.percentage*a.weight)/nullif(sum(a.weight),0),1) as pct
    from public.students st
    join public.grades g on g.student_id=st.student_id
    join public.assessments a on a.id=g.assessment_id
    join public.subjects sub on sub.id=a.subject_id
    where st.school_id=v_sess.school_id and st.class=trim(p_class) and st.status='Active'
      and a.term_id=p_term_id and a.class=trim(p_class) and g.percentage is not null
    group by st.student_id,a.subject_id,sub.subject_name
  ),
  student_overall as (
    select student_id,round(avg(pct),1) as overall_pct from subject_avg group by student_id
  ),
  subjects_json as (
    select student_id,jsonb_agg(jsonb_build_object(
      'subject_id',subject_id,'subject_name',subject_name,'pct',pct,
      'letter',public._grade_letter(v_sess.school_id,pct)
    ) order by subject_name) as subjects
    from subject_avg group by student_id
  )
  select jsonb_agg(jsonb_build_object(
    'student_id',st.student_id,'name_en',st.name_en,
    'subjects',coalesce(sj.subjects,'[]'::jsonb),'overall_pct',so.overall_pct,
    'overall_letter',public._grade_letter(v_sess.school_id,so.overall_pct)
  ) order by st.name_en) into v_result
  from public.students st
  left join subjects_json sj on sj.student_id=st.student_id
  left join student_overall so on so.student_id=st.student_id
  where st.school_id=v_sess.school_id and st.class=trim(p_class) and st.status='Active';

  return jsonb_build_object('ok',true,'students',coalesce(v_result,'[]'::jsonb));
end;
$function$;

revoke execute on function public.rpc_get_report_card(text,bigint,text) from public;
grant execute on function public.rpc_get_report_card(text,bigint,text) to anon,authenticated;