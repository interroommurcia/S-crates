-- Ejecutar en Supabase SQL Editor DESPUES de v19. No borra datos.
-- Fondo de ahorro: saldo acumulado que YA tienes, mas las aportaciones que
-- etiquetes como apartado 'ahorro'.
--   total = base_amount + ingresos(ahorro) - gastos(ahorro, = retiradas)

create table if not exists savings_funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_amount numeric not null default 0 check (base_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table savings_funds enable row level security;
revoke all on savings_funds from anon, authenticated;

-- Seed: tu fondo actual de 2.600 EUR (solo si no existe ya).
insert into savings_funds (name, base_amount)
select 'Fondo de ahorro', 2600
where not exists (select 1 from savings_funds where name = 'Fondo de ahorro');
