-- Ejecutar en Supabase SQL Editor DESPUES de v20. No borra datos.
-- Pasivos manuales extra (C y P): numeros editables que cuentan en el
-- numerador del ratio de endeudamiento, pero NO en el patrimonio.

create table if not exists extra_debts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric not null default 0 check (amount >= 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table extra_debts enable row level security;
revoke all on extra_debts from anon, authenticated;

-- Seed: C y P a 0 (solo si no existen ya).
insert into extra_debts (label, amount, position)
select 'C', 0, 1 where not exists (select 1 from extra_debts where label = 'C');
insert into extra_debts (label, amount, position)
select 'P', 0, 2 where not exists (select 1 from extra_debts where label = 'P');
