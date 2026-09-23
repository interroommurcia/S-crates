-- Ejecutar en Supabase SQL Editor DESPUES de v7. No borra nada.
-- Cuentas diferenciadas: personal vs empresa.

alter table transactions
  add column if not exists ledger text not null default 'personal';

alter table transactions drop constraint if exists transactions_ledger_check;
alter table transactions
  add constraint transactions_ledger_check check (ledger in ('personal', 'empresa'));

create index if not exists idx_tx_ledger on transactions(ledger);
