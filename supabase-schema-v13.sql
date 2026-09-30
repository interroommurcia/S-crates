-- Ejecutar en Supabase SQL Editor DESPUES de v12. No borra nada previo.
-- Rentas Indirectas: pisos en explotacion. Los movimientos cuentan en Personal
-- y ademas se etiquetan por piso para ver rentabilidad.

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table transactions
  add column if not exists property_id uuid references properties(id) on delete set null;

alter table recurring_expenses
  add column if not exists property_id uuid references properties(id) on delete set null;

create index if not exists transactions_property_idx
  on transactions (property_id, occurred_at);

-- Seed inicial: piso Guadalupe.
insert into properties (name)
select 'Guadalupe'
where not exists (select 1 from properties where name = 'Guadalupe');
