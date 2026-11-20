-- Ejecutar en Supabase SQL Editor DESPUES de v21. No borra datos.
-- Archivado de movimientos: se ocultan de la lista principal pero siguen
-- contando en balances y ratios. Se consultan en la vista "Archivados".

alter table transactions
  add column if not exists archived boolean not null default false;

create index if not exists transactions_archived_idx
  on transactions (archived);
