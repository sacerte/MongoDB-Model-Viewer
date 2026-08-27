-- MongoDB Modeler Web: collaboration schema
-- Run this entire file in Supabase: SQL Editor > New query > Run.

create table if not exists public.shared_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  local_project_id text not null,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_project_id)
);

create table if not exists public.project_members (
  project_id uuid not null references public.shared_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members add column if not exists email text;

create table if not exists public.project_invites (
  code uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.shared_projects(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')) default 'editor',
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shared_projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;

-- Allow this setup script to be run again safely after a partial execution.
drop policy if exists "Members can read shared projects" on public.shared_projects;
drop policy if exists "Authenticated users can create projects" on public.shared_projects;
drop policy if exists "Owners and editors can update projects" on public.shared_projects;
drop policy if exists "Owners can delete projects" on public.shared_projects;
drop policy if exists "Members can view members" on public.project_members;
drop policy if exists "Owners manage members" on public.project_members;
drop policy if exists "Members can view invites" on public.project_invites;
drop policy if exists "Owners manage invites" on public.project_invites;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid());
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid() and role in ('owner', 'editor'));
$$;

-- SECURITY DEFINER avoids recursive RLS evaluation when a policy checks an administrator role.
create or replace function public.is_project_admin(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.add_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role, email)
  select new.id, new.owner_id, 'owner', email from auth.users where id = new.owner_id;
  return new;
end;
$$;

drop trigger if exists shared_projects_add_owner on public.shared_projects;
create trigger shared_projects_add_owner after insert on public.shared_projects
for each row execute function public.add_project_owner();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists shared_projects_updated_at on public.shared_projects;
create trigger shared_projects_updated_at before update on public.shared_projects
for each row execute function public.set_updated_at();

create policy "Members can read shared projects" on public.shared_projects for select using (public.is_project_member(id));
create policy "Authenticated users can create projects" on public.shared_projects for insert with check (owner_id = auth.uid());
create policy "Owners and editors can update projects" on public.shared_projects for update using (public.can_edit_project(id)) with check (public.can_edit_project(id));
create policy "Owners can delete projects" on public.shared_projects for delete using (owner_id = auth.uid());
create policy "Members can view members" on public.project_members for select using (public.is_project_member(project_id));
create policy "Owners manage members" on public.project_members for all using (
  public.is_project_admin(project_id)
);
create policy "Members can view invites" on public.project_invites for select using (public.is_project_member(project_id));
create policy "Owners manage invites" on public.project_invites for all using (
  public.is_project_admin(project_id)
);

-- Guarantee ownership server-side. This also avoids browser clients failing the insert RLS check.
create or replace function public.force_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner_id := auth.uid();
  return new;
end;
$$;
drop trigger if exists shared_projects_force_owner on public.shared_projects;
create trigger shared_projects_force_owner before insert on public.shared_projects
for each row execute function public.force_project_owner();
drop policy if exists "Authenticated users can create projects" on public.shared_projects;
create policy "Authenticated users can create projects" on public.shared_projects
for insert with check (auth.uid() is not null);

-- Use this RPC from the web app instead of a direct INSERT. It bypasses RLS only
-- for this controlled operation and always assigns the authenticated caller as owner.
create or replace function public.create_shared_project(project_local_id text, project_name text, project_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_project_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.shared_projects (owner_id, local_project_id, name, data)
  values (auth.uid(), project_local_id, project_name, project_data)
  returning id into new_project_id;
  return new_project_id;
end;
$$;
grant execute on function public.create_shared_project(text, text, jsonb) to authenticated;

-- Create invitations server-side after verifying the authenticated user owns the project.
create or replace function public.create_project_invite(target_project_id uuid, invite_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare invite_code uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if invite_role not in ('editor', 'viewer') then raise exception 'Invalid invite role'; end if;
  if not exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the project administrator can create invitations';
  end if;
  insert into public.project_invites (project_id, role, created_by)
  values (target_project_id, invite_role, auth.uid())
  returning code into invite_code;
  return invite_code;
end;
$$;
grant execute on function public.create_project_invite(uuid, text) to authenticated;

-- Safe join operation: returns the project and assigned role in one secure response.
drop function if exists public.join_project_by_code(uuid);
create function public.join_project_by_code(invite_code uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invite public.project_invites;
declare project_data jsonb;
begin
  select * into invite from public.project_invites where code = invite_code and (expires_at is null or expires_at > now());
  if invite.project_id is null then raise exception 'Invitation invalid or expired'; end if;
  insert into public.project_members (project_id, user_id, role, email)
  select invite.project_id, auth.uid(), invite.role, email from auth.users where id = auth.uid()
  on conflict (project_id, user_id) do update set role = excluded.role, email = excluded.email;
  select data into project_data from public.shared_projects where id = invite.project_id;
  return jsonb_build_object('project_id', invite.project_id, 'role', invite.role, 'project', project_data);
end;
$$;

grant execute on function public.join_project_by_code(uuid) to authenticated;

-- Member administration, available only to the current project owner.
create or replace function public.set_project_member_role(target_project_id uuid, target_user_id uuid, next_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if next_role not in ('owner', 'editor', 'viewer') then raise exception 'Invalid role'; end if;
  if not exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the project administrator can manage members';
  end if;
  update public.project_members set role = next_role where project_id = target_project_id and user_id = target_user_id;
end;
$$;
grant execute on function public.set_project_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_project_member(target_project_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.project_members where project_id = target_project_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the project administrator can manage members';
  end if;
  if target_user_id = auth.uid() then raise exception 'The administrator cannot remove themselves'; end if;
  delete from public.project_members where project_id = target_project_id and user_id = target_user_id;
end;
$$;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.shared_projects;
