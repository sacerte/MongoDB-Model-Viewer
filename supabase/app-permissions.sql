-- Global application permissions. Run in Supabase SQL Editor after the user has registered.
create table if not exists public.app_user_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  permissions jsonb not null default '{"diagram":true,"indexes":true,"dictionary":true,"schema":true,"documentation":true,"projects":true,"importExport":true,"collaboration":false,"editContent":false,"settings":false}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_user_permissions enable row level security;

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_user_permissions where user_id = auth.uid() and is_admin = true);
$$;

create or replace function public.get_my_app_permissions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  select jsonb_build_object('is_admin', is_admin, 'permissions', permissions) into result
  from public.app_user_permissions where user_id = auth.uid();
  return coalesce(result, '{"is_admin":false,"permissions":{"diagram":true,"indexes":true,"dictionary":true,"schema":true,"documentation":true,"projects":true,"importExport":true,"collaboration":false,"editContent":false,"settings":false}}'::jsonb);
end;
$$;

create or replace function public.list_app_users()
returns table(user_id uuid, email text, is_admin boolean, permissions jsonb)
language sql security definer set search_path = public as $$
  select u.id, u.email::text, coalesce(p.is_admin, false), coalesce(p.permissions, '{"diagram":true,"indexes":true,"dictionary":true,"schema":true,"documentation":true,"projects":true,"importExport":true,"collaboration":false,"editContent":false,"settings":false}'::jsonb)
  from auth.users u left join public.app_user_permissions p on p.user_id = u.id
  where public.is_global_admin()
  order by u.email;
$$;

create or replace function public.set_app_user_permissions(target_user_id uuid, target_is_admin boolean, target_permissions jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare target_email text;
begin
  if not public.is_global_admin() then raise exception 'Only a global administrator can manage application permissions'; end if;
  select email into target_email from auth.users where id = target_user_id;
  if target_email is null then raise exception 'User not found'; end if;
  insert into public.app_user_permissions(user_id, email, is_admin, permissions, updated_at)
  values (target_user_id, target_email, target_is_admin, target_permissions, now())
  on conflict (user_id) do update set is_admin = excluded.is_admin, permissions = excluded.permissions, updated_at = now();
end;
$$;

grant execute on function public.get_my_app_permissions() to authenticated;
grant execute on function public.list_app_users() to authenticated;
grant execute on function public.set_app_user_permissions(uuid, boolean, jsonb) to authenticated;

-- Bootstrap global administrator (the account must already exist in Authentication > Users).
insert into public.app_user_permissions(user_id, email, is_admin, permissions)
select id, email, true, '{"diagram":true,"indexes":true,"dictionary":true,"schema":true,"documentation":true,"projects":true,"importExport":true,"collaboration":true,"editContent":true,"settings":true}'::jsonb
from auth.users where lower(email) = 'ymeshir@gmail.com'
on conflict (user_id) do update set is_admin = true, permissions = excluded.permissions, updated_at = now();
