-- Ejecutar en Supabase SQL Editor DESPUES de v4. No borra nada.
-- Credenciales WebAuthn (passkeys).

create table if not exists credentials (
  id uuid default gen_random_uuid() primary key,
  credential_id text not null unique,
  public_key text not null,            -- base64
  counter bigint not null default 0,
  transports jsonb default '[]',
  label text,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

alter table credentials enable row level security;
drop policy if exists "service_role_credentials" on credentials;
create policy "service_role_credentials" on credentials for all using (true) with check (true);
