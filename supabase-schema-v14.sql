-- Ejecutar en Supabase SQL Editor DESPUES de v13. No borra nada previo.
-- Ingresos "proximamente" (por cobrar): no cuentan en totales hasta marcarse cobrados.

alter table transactions
  add column if not exists pending boolean not null default false;

-- Filas existentes quedan como cobradas (default false).
update transactions set pending = false where pending is null;

-- Indice para listar/filtrar pendientes rapido.
create index if not exists transactions_pending_idx
  on transactions (pending, occurred_at);
