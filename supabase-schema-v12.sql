-- Ejecutar en Supabase SQL Editor DESPUES de v11. No borra nada previo.
-- Gastos fijos mensuales: plantillas que se materializan como transactions cada mes.

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  type text not null default 'expense' check (type in ('expense', 'tax')),
  category text not null default 'otros',
  subcategory text,
  description text,
  account text not null default 'banco',
  ledger text not null default 'personal' check (ledger in ('personal', 'empresa')),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Enlaza la transaccion generada con su plantilla (para no duplicar por mes).
alter table transactions
  add column if not exists recurring_id uuid references recurring_expenses(id) on delete set null;

create index if not exists transactions_recurring_idx
  on transactions (recurring_id, occurred_at);
