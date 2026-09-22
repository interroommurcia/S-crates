-- Ejecutar en Supabase SQL Editor DESPUES de v2. No borra nada.
-- Modulo de contabilidad personal.

create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  amount numeric(12,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  category text not null default 'otros',
  description text,
  account text default 'efectivo',
  occurred_at date not null default current_date,
  created_at timestamptz default now()
);

create index if not exists idx_tx_date on transactions(occurred_at desc);
create index if not exists idx_tx_category on transactions(category);
create index if not exists idx_tx_type on transactions(type);

alter table transactions enable row level security;
drop policy if exists "service_role_transactions" on transactions;
create policy "service_role_transactions" on transactions for all using (true) with check (true);
