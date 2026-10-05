-- Ejecutar en Supabase SQL Editor DESPUES de v14. No borra nada previo.
-- Notas tipo post-it en Finanzas. Se autoborran a los 100 dias de crearse
-- (limpieza perezosa en cada GET de /api/notes), salvo que se borren antes.

create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  content text not null default '',
  color text not null default 'amber',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists notes_created_idx on notes (created_at desc);

alter table notes enable row level security;
create policy "service_role_notes" on notes for all using (true) with check (true);
