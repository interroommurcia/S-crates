-- Ejecutar en Supabase SQL Editor DESPUES de v23. No borra datos.
-- Archivos por proyecto (RAG): se suben documentos, se trocean y se embeben.
-- Todas las conversaciones del proyecto consultan sus trozos por similitud.

create extension if not exists vector;

create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  kind text not null,              -- pdf | docx | text | image
  bytes integer default 0,
  chunks integer default 0,
  status text not null default 'ready',  -- processing | ready | error
  error text,
  created_at timestamptz default now()
);

create table if not exists doc_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid not null references documents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  idx integer not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists documents_project_idx on documents (project_id, created_at desc);
create index if not exists doc_chunks_document_idx on doc_chunks (document_id);
create index if not exists doc_chunks_project_idx on doc_chunks (project_id);
create index if not exists doc_chunks_embedding_idx on doc_chunks
  using hnsw (embedding vector_cosine_ops);

alter table documents enable row level security;
alter table doc_chunks enable row level security;
drop policy if exists "service_role_documents" on documents;
drop policy if exists "service_role_doc_chunks" on doc_chunks;
create policy "service_role_documents" on documents for all using (true) with check (true);
create policy "service_role_doc_chunks" on doc_chunks for all using (true) with check (true);

-- Busqueda semantica de trozos, acotada a un proyecto.
create or replace function match_doc_chunks(
  query_embedding vector(1024),
  p_project_id uuid,
  match_count int default 6,
  min_similarity float default 0.2
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from doc_chunks c
  where c.project_id = p_project_id
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
