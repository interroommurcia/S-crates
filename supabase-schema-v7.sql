-- Ejecutar en Supabase SQL Editor DESPUES de v6. No borra nada.
-- Subcategorias para estudios de gasto mas finos.

alter table transactions
  add column if not exists subcategory text;

create index if not exists idx_tx_subcategory on transactions(subcategory);
