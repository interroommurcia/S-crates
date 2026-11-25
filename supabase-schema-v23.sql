-- Ejecutar en Supabase SQL Editor DESPUES de v22. No borra datos.
-- Proyectos: agrupan conversaciones (estilo Claude). Las conversaciones con
-- project_id conservan su transcript completo (no se vacian al reflejar), para
-- poder reabrirlas con todo el historial.

create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table conversations
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists title text;

create index if not exists conversations_project_idx
  on conversations (project_id, updated_at desc);

create index if not exists projects_updated_idx
  on projects (updated_at desc);

alter table projects enable row level security;
create policy "service_role_projects" on projects for all using (true) with check (true);
