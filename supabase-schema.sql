-- Supabase schema for gestion-flota
-- Run this in the Supabase SQL Editor.
-- Note: for the signup flow to work smoothly, disable email confirmation in Supabase Auth or configure SMTP.

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  username text not null unique,
  role text not null default 'trabajador' check (role in ('admin', 'trabajador', 'mecanico')),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  specialty text,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  equipment text not null,
  location text,
  deviation text not null,
  status text not null default 'Pendiente',
  mechanic_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  validated_by text,
  operation_note text,
  operated_by text
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  equipment text not null,
  requester_id uuid references public.profiles(id) on delete set null,
  requester_name text not null,
  need text not null,
  status text not null default 'Pedido',
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_items (
  id uuid primary key default gen_random_uuid(),
  equipment text not null,
  parts text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  is_read boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists reports_mechanic_idx on public.reports(mechanic_id);
create index if not exists reports_created_by_idx on public.reports(created_by);
create index if not exists orders_requester_idx on public.orders(requester_id);
create index if not exists notifications_created_by_idx on public.notifications(created_by);

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.orders enable row level security;
alter table public.fleet_items enable row level security;
alter table public.notifications enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function private.is_approved_user()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'aprobado'
  );
$$;

revoke all on function private.is_admin() from public, authenticated;
grant execute on function private.is_admin() to authenticated;

revoke all on function private.is_approved_user() from public, authenticated;
grant execute on function private.is_approved_user() to authenticated;

create or replace function private.enforce_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is null then
    raise exception 'id is required';
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'trabajador' then
      raise exception 'Only trabajadores can be created through this flow';
    end if;
    if new.status is distinct from 'pendiente' then
      raise exception 'New profiles must start as pending';
    end if;
    if new.id <> auth.uid() then
      raise exception 'Users can only create their own profile';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old is not null and old.email is distinct from new.email and not private.is_admin() then
      raise exception 'email cannot be changed by a user';
    end if;
    if old is not null and old.role is distinct from new.role and not private.is_admin() then
      raise exception 'role cannot be changed by a user';
    end if;
    if old is not null and old.status is distinct from new.status and not private.is_admin() then
      raise exception 'status cannot be changed by a user';
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger profiles_guard
before insert or update on public.profiles
for each row
execute function private.enforce_profile_permissions();

create or replace function private.enforce_admin_only_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (old.role is distinct from new.role) and not private.is_admin() then
      raise exception 'Only admins can change roles';
    end if;
    if (old.status is distinct from new.status) and not private.is_admin() then
      raise exception 'Only admins can change status';
    end if;
    if (old.email is distinct from new.email) and not private.is_admin() then
      raise exception 'Only admins can change email';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if not private.is_admin() then
      raise exception 'Only admins can delete users';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace trigger profiles_admin_guard
before update or delete on public.profiles
for each row
execute function private.enforce_admin_only_profile_changes();

drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_self_safe on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (
    auth.uid() = id
  );

create policy profiles_select_admin
  on public.profiles for select to authenticated
  using (private.is_admin());

create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (
    auth.uid() = id
    and role = 'trabajador'
    and status = 'pendiente'
  );

create policy profiles_update_self_safe
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy profiles_update_admin
  on public.profiles for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy profiles_delete_admin
  on public.profiles for delete to authenticated
  using (private.is_admin());

drop policy if exists reports_select_authenticated on public.reports;
drop policy if exists reports_select_approved on public.reports;
drop policy if exists reports_insert_self on public.reports;
drop policy if exists reports_insert_approved on public.reports;
drop policy if exists reports_update_self_or_admin on public.reports;
drop policy if exists reports_update_approved on public.reports;
drop policy if exists reports_delete_admin on public.reports;

create policy reports_select_approved
  on public.reports for select to authenticated
  using (private.is_approved_user());

create policy reports_insert_approved
  on public.reports for insert to authenticated
  with check (private.is_approved_user() and created_by = auth.uid());

create policy reports_update_approved
  on public.reports for update to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = created_by
      or auth.uid() = mechanic_id
      or private.is_admin()
    )
  )
  with check (
    private.is_approved_user()
    and (
      auth.uid() = created_by
      or auth.uid() = mechanic_id
      or private.is_admin()
    )
  );

create policy reports_delete_admin
  on public.reports for delete to authenticated
  using (private.is_admin());

drop policy if exists orders_select_authenticated on public.orders;
drop policy if exists orders_select_approved on public.orders;
drop policy if exists orders_insert_self on public.orders;
drop policy if exists orders_insert_approved on public.orders;
drop policy if exists orders_update_self_or_admin on public.orders;
drop policy if exists orders_update_approved on public.orders;
drop policy if exists orders_delete_admin on public.orders;

create policy orders_select_approved
  on public.orders for select to authenticated
  using (private.is_approved_user());

create policy orders_insert_approved
  on public.orders for insert to authenticated
  with check (private.is_approved_user() and requester_id = auth.uid());

create policy orders_update_approved
  on public.orders for update to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = requester_id
      or private.is_admin()
    )
  )
  with check (
    private.is_approved_user()
    and (
      auth.uid() = requester_id
      or private.is_admin()
    )
  );

create policy orders_delete_admin
  on public.orders for delete to authenticated
  using (private.is_admin());

drop policy if exists fleet_select_authenticated on public.fleet_items;
drop policy if exists fleet_select_approved on public.fleet_items;
drop policy if exists fleet_insert_admin on public.fleet_items;
drop policy if exists fleet_update_admin on public.fleet_items;
drop policy if exists fleet_delete_admin on public.fleet_items;

create policy fleet_select_approved
  on public.fleet_items for select to authenticated
  using (private.is_approved_user());

create policy fleet_insert_admin
  on public.fleet_items for insert to authenticated
  with check (private.is_admin());

create policy fleet_update_admin
  on public.fleet_items for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy fleet_delete_admin
  on public.fleet_items for delete to authenticated
  using (private.is_admin());

drop policy if exists notifications_select_authenticated on public.notifications;
drop policy if exists notifications_select_approved on public.notifications;
drop policy if exists notifications_insert_self on public.notifications;
drop policy if exists notifications_insert_approved on public.notifications;
drop policy if exists notifications_update_self_or_admin on public.notifications;
drop policy if exists notifications_update_approved on public.notifications;
drop policy if exists notifications_delete_admin_or_self on public.notifications;

create policy notifications_select_approved
  on public.notifications for select to authenticated
  using (private.is_approved_user());

create policy notifications_insert_approved
  on public.notifications for insert to authenticated
  with check (private.is_approved_user() and created_by = auth.uid());

create policy notifications_update_approved
  on public.notifications for update to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = created_by
      or private.is_admin()
    )
  )
  with check (
    private.is_approved_user()
    and (
      auth.uid() = created_by
      or private.is_admin()
    )
  );

create policy notifications_delete_admin_or_self
  on public.notifications for delete to authenticated
  using (
    private.is_admin()
    or (
      private.is_approved_user() and created_by = auth.uid()
    )
  );

-- Manual bootstrap for the first admin account after creating the user in Supabase Auth:
-- 1) Create the Auth user in Supabase Auth.
-- 2) Insert the profile manually with the desired admin values using a SECURITY DEFINER bypass.
--    Run this as a database owner or service role context in the SQL editor:
--    insert into public.profiles (id, email, name, username, role, status, specialty)
--    values (
--      '<AUTH_USER_ID>',
--      'admin@tuempresa.com',
--      'Administrador',
--      'admin',
--      'admin',
--      'aprobado',
--      'electricista'
--    );
-- 3) If the insert is blocked by the trigger, temporarily disable the trigger for the bootstrap step:
--    alter table public.profiles disable trigger profiles_guard;
--    insert into public.profiles (...);
--    alter table public.profiles enable trigger profiles_guard;
-- 4) After that, update the profile later through an admin-only operation.
