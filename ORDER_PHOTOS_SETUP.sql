-- Fotos opcionales para pedidos de repuestos.
-- Ejecutar una vez en Supabase SQL Editor.

alter table public.orders add column if not exists photos jsonb not null default '[]'::jsonb;
