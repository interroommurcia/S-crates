-- Ejecutar en Supabase SQL Editor DESPUES de v17. No borra datos.
-- FORTIFICACION: cierra el acceso directo a la base de datos con la anon key.
--
-- Problema: las policies "for all using (true)" no llevaban "to service_role",
-- asi que aplicaban a TODOS los roles (incluido anon): cualquiera con la URL del
-- proyecto y la anon key podia leer y escribir facts, transactions,
-- conversations, credentials, etc. por la API REST de Supabase, sin pasar por
-- el login de Socrates. Ademas calendar_events, recurring_expenses y properties
-- no tenian RLS activado.
--
-- Solucion: RLS activado en todo y NINGUNA policy. El backend usa service_role,
-- que se salta RLS; anon/authenticated se quedan sin acceso.

-- 1) Intentos de login (rate limiting persistente)
create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts (ip, created_at);
create index if not exists login_attempts_created_idx on login_attempts (created_at);

-- 2) RLS en todas las tablas de public + borrar todas las policies permisivas
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Quitar privilegios a anon/authenticated (segunda barrera ademas de RLS)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- 4) Bucket de facturas: asegurar que es privado y sin policies de storage
update storage.buckets set public = false where id = 'receipts';

-- Comprobacion: debe devolver 0 filas (ninguna policy en public)
select tablename, policyname from pg_policies where schemaname = 'public';
