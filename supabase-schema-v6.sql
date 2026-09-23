-- Ejecutar en Supabase SQL Editor DESPUES de v5. No borra nada.
-- Base de conocimiento: protocolos que Socrates usa como contexto.

create table if not exists protocols (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists protocol_chunks (
  id uuid default gen_random_uuid() primary key,
  protocol_id uuid not null references protocols(id) on delete cascade,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists idx_protocol_chunks_protocol on protocol_chunks(protocol_id);
create index if not exists idx_protocol_chunks_embedding on protocol_chunks
  using hnsw (embedding vector_cosine_ops);

alter table protocols enable row level security;
alter table protocol_chunks enable row level security;
drop policy if exists "service_role_protocols" on protocols;
drop policy if exists "service_role_protocol_chunks" on protocol_chunks;
create policy "service_role_protocols" on protocols for all using (true) with check (true);
create policy "service_role_protocol_chunks" on protocol_chunks for all using (true) with check (true);

-- Busqueda semantica sobre chunks (para RAG futuro si crecen mucho)
create or replace function match_protocol_chunks(
  query_embedding vector(1024),
  match_count int default 6,
  min_similarity float default 0.3
)
returns table (id uuid, protocol_id uuid, content text, similarity float)
language sql stable
as $$
  select c.id, c.protocol_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from protocol_chunks c
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
