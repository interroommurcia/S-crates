-- Ejecutar en Supabase SQL Editor DESPUES de supabase-schema.sql
-- No borra nada del schema anterior.

-- Extensiones
create extension if not exists vector;

-- Facts: hechos estructurados con embeddings para busqueda semantica
create table if not exists facts (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  category text default 'general',
  importance smallint default 3 check (importance between 1 and 5),
  source text default 'chat',
  embedding vector(1024),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_facts_category on facts(category);
create index if not exists idx_facts_updated on facts(updated_at desc);
create index if not exists idx_facts_embedding on facts
  using hnsw (embedding vector_cosine_ops);

alter table facts enable row level security;
drop policy if exists "service_role_facts" on facts;
create policy "service_role_facts" on facts for all using (true) with check (true);

-- Episodes: resumenes de conversaciones (fase C, ya reservado)
create table if not exists episodes (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete set null,
  summary text not null,
  key_points jsonb default '[]',
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists idx_episodes_embedding on episodes
  using hnsw (embedding vector_cosine_ops);

alter table episodes enable row level security;
drop policy if exists "service_role_episodes" on episodes;
create policy "service_role_episodes" on episodes for all using (true) with check (true);

-- Funcion de busqueda semantica sobre facts
create or replace function match_facts(
  query_embedding vector(1024),
  match_count int default 8,
  min_similarity float default 0.3
)
returns table (
  id uuid,
  content text,
  category text,
  importance smallint,
  similarity float,
  created_at timestamptz
)
language sql stable
as $$
  select
    f.id,
    f.content,
    f.category,
    f.importance,
    1 - (f.embedding <=> query_embedding) as similarity,
    f.created_at
  from facts f
  where f.embedding is not null
    and 1 - (f.embedding <=> query_embedding) > min_similarity
  order by f.embedding <=> query_embedding
  limit match_count;
$$;
