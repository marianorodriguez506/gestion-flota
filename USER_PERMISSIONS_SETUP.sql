create table if not exists public.user_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.user_permissions enable row level security;

drop policy if exists "admins manage user permissions" on public.user_permissions;
create policy "admins manage user permissions"
on public.user_permissions
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'administrador')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'administrador')
  )
);

drop policy if exists "users read own permissions" on public.user_permissions;
create policy "users read own permissions"
on public.user_permissions
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'administrador')
  )
);
