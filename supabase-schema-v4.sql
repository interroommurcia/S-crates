-- Ejecutar en Supabase SQL Editor DESPUES de v3. No borra nada.
-- Soporte para reflexion automatica post-conversacion.

alter table conversations
  add column if not exists last_reflected_count integer not null default 0;

-- Un episodio por conversacion (para poder actualizarlo en cada reflexion).
-- Indice unico NO parcial: sirve como target de ON CONFLICT en PostgREST.
-- Postgres trata los NULL como distintos, asi que permite varias filas sin conversation_id.
drop index if exists uniq_episode_conversation;
create unique index if not exists uniq_episode_conversation
  on episodes(conversation_id);
