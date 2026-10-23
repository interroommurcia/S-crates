-- Ejecutar en Supabase SQL Editor DESPUES de v16. No borra nada previo.
-- Papelera de notas: ya NO se autoborran a los 100 dias. Solo se borran a
-- mano (pasan a la papelera) y se purgan definitivamente 3 dias despues.

alter table notes
  add column if not exists deleted_at timestamptz;

create index if not exists notes_deleted_idx on notes (deleted_at);
