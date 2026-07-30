-- Hoja Baterias - ejecutar una vez en Supabase SQL Editor.

create table if not exists public.battery_records (
  id uuid primary key default gen_random_uuid(),
  equipment text not null,
  mechanic_id uuid references public.profiles(id) on delete set null,
  mechanic_name text,
  batteries text not null,
  quantity integer not null default 1 check (quantity > 0),
  condition text not null default 'Nueva' check (condition in ('Nueva', 'Usada')),
  installed_at date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists battery_records_equipment_idx on public.battery_records(equipment);
create index if not exists battery_records_mechanic_idx on public.battery_records(mechanic_id);
create index if not exists battery_records_installed_at_idx on public.battery_records(installed_at);

alter table public.battery_records enable row level security;

drop policy if exists battery_records_select_approved on public.battery_records;
drop policy if exists battery_records_insert_admin on public.battery_records;
drop policy if exists battery_records_update_admin on public.battery_records;
drop policy if exists battery_records_delete_admin on public.battery_records;

create policy battery_records_select_approved
  on public.battery_records for select to authenticated
  using (private.is_approved_user());

create policy battery_records_insert_admin
  on public.battery_records for insert to authenticated
  with check (private.is_admin());

create policy battery_records_update_admin
  on public.battery_records for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy battery_records_delete_admin
  on public.battery_records for delete to authenticated
  using (private.is_admin());
