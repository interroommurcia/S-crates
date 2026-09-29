-- Ejecutar en Supabase SQL Editor DESPUES de v10. No borra nada previo.
-- Calendario: tareas y reuniones. Se autoborran al finalizar (via API).

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('task', 'meeting')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_starts_at_idx
  on calendar_events (starts_at);
