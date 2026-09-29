create table if not exists public.teacher_id_cards (
  card_id uuid primary key default extensions.gen_random_uuid(),
  teacher_id text not null references public.teachers(teacher_id) on delete cascade,
  school_id uuid not null,
  token_hash text not null,
  token_prefix text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_teacher_id text,
  last_used_at timestamptz
);
create unique index if not exists teacher_id_cards_token_hash_uq on public.teacher_id_cards(token_hash);
create index if not exists teacher_id_cards_teacher_idx on public.teacher_id_cards(teacher_id);
create index if not exists teacher_id_cards_school_idx on public.teacher_id_cards(school_id);

create or replace function public.rpc_admin_create_teacher_card(p_session_token text,p_teacher_id text,p_expires_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $function$
declare a record; t record; raw text; h text; c record;
begin
 select s.school_id,s.teacher_id as admin_id,t.role as admin_role into a from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id where s.session_token=p_session_token and s.expires_at>now() and t.status='active' and s.school_id=t.school_id and s.role=t.role and t.role in ('admin','super_admin') limit 1;
 if a is null then return jsonb_build_object('ok',false,'error','not_admin'); end if;
 select teacher_id,teacher_name,school_id,status,role,photo_url into t from public.teachers where teacher_id=p_teacher_id and school_id=a.school_id limit 1;
 if t is null then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;
 if t.status<>'active' then return jsonb_build_object('ok',false,'error','inactive'); end if;
 raw:=encode(extensions.gen_random_bytes(24),'hex'); h:=encode(extensions.digest(raw,'sha256'),'hex');
 update public.teacher_id_cards set revoked_at=now() where teacher_id=p_teacher_id and revoked_at is null;
 insert into public.teacher_id_cards(teacher_id,school_id,token_hash,token_prefix,expires_at,created_by_teacher_id) values(p_teacher_id,a.school_id,h,left(raw,10),p_expires_at,a.admin_id) returning * into c;
 return jsonb_build_object('ok',true,'card_id',c.card_id,'teacher_id',t.teacher_id,'teacher_name',t.teacher_name,'role',t.role,'photo_url',t.photo_url,'token',raw,'token_prefix',c.token_prefix,'expires_at',c.expires_at);
end;$function$;
create or replace function public.rpc_admin_revoke_teacher_card(p_session_token text,p_teacher_id text) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $function$
declare a record; begin
 select s.school_id into a from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id where s.session_token=p_session_token and s.expires_at>now() and t.status='active' and s.school_id=t.school_id and s.role=t.role and t.role in ('admin','super_admin') limit 1;
 if a is null then return jsonb_build_object('ok',false,'error','not_admin'); end if;
 update public.teacher_id_cards set revoked_at=now() where teacher_id=p_teacher_id and school_id=a.school_id and revoked_at is null;
 return jsonb_build_object('ok',true); end;$function$;
create or replace function public.rpc_teacher_card_login_start(p_token text) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_temp' as $function$
declare h text; c record; t record; begin
 if coalesce(length(trim(p_token)),0)<20 then return jsonb_build_object('ok',false,'error','invalid_card'); end if;
 h:=encode(extensions.digest(trim(p_token),'sha256'),'hex');
 select * into c from public.teacher_id_cards where token_hash=h and revoked_at is null and (expires_at is null or expires_at>now()) limit 1;
 if c is null then return jsonb_build_object('ok',false,'error','invalid_card'); end if;
 select teacher_id,teacher_name,school_id,role,status into t from public.teachers where teacher_id=c.teacher_id and school_id=c.school_id limit 1;
 if t is null or t.status<>'active' then return jsonb_build_object('ok',false,'error','inactive'); end if;
 update public.teacher_id_cards set last_used_at=now() where card_id=c.card_id;
 return jsonb_build_object('ok',true,'card_id',c.card_id,'teacher_id',t.teacher_id,'teacher_name',t.teacher_name,'role',t.role,'school_id',t.school_id,'requires_pin',true);
end;$function$;
revoke all on function public.rpc_admin_create_teacher_card(text,text,timestamptz) from public;
grant execute on function public.rpc_admin_create_teacher_card(text,text,timestamptz) to anon,authenticated;
revoke all on function public.rpc_admin_revoke_teacher_card(text,text) from public;
grant execute on function public.rpc_admin_revoke_teacher_card(text,text) to anon,authenticated;
revoke all on function public.rpc_teacher_card_login_start(text) from public;
grant execute on function public.rpc_teacher_card_login_start(text) to anon,authenticated;