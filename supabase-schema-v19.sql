-- Ejecutar en Supabase SQL Editor DESPUES de v18. No borra datos.
-- Apartados (botes) de la cuenta personal + deuda a amortizar.
--
-- apartado: etiqueta opcional de cada movimiento personal para agruparlo en
--   botes y calcular ratios. Valores: 'estilo_vida', 'ahorro', 'deuda'.
--   - estilo_vida: gasto corriente de vivir.
--   - ahorro: dinero que apartas (normalmente ingresos derivados a ahorro).
--   - deuda: pagos (gastos) que amortizan la deuda de abajo.
-- Un movimiento sin apartado (NULL) no entra en ningun bote.

alter table transactions
  add column if not exists apartado text
  check (apartado in ('estilo_vida', 'ahorro', 'deuda'));

create index if not exists transactions_apartado_idx
  on transactions (apartado, ledger, occurred_at);

-- Deudas a amortizar. remaining = initial_amount - sum(pagos tagged 'deuda').
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initial_amount numeric not null check (initial_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS cerrado (igual que el resto): solo service_role, sin policies.
alter table debts enable row level security;
revoke all on debts from anon, authenticated;

-- Seed: la deuda de clientes de 35.000 EUR (solo si no existe ya).
insert into debts (name, initial_amount)
select 'Deuda clientes', 35000
where not exists (select 1 from debts where name = 'Deuda clientes');
