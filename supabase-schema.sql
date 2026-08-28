-- Ejecutar en Supabase SQL Editor

-- Tabla de memoria persistente de Sócrates
create table if not exists memory (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  category text default 'general',
  created_at timestamptz default now()
);

-- Tabla de conversaciones
create table if not exists conversations (
  id uuid primary key,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices
create index if not exists idx_memory_category on memory(category);
create index if not exists idx_memory_created on memory(created_at desc);
create index if not exists idx_conversations_updated on conversations(updated_at desc);

-- RLS (desactivar para uso personal sin auth por ahora)
alter table memory enable row level security;
alter table conversations enable row level security;

-- Políticas permisivas (solo con service_role key desde el backend)
create policy "service_role_memory" on memory for all using (true) with check (true);
create policy "service_role_conversations" on conversations for all using (true) with check (true);
