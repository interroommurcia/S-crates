-- Ejecutar en Supabase SQL Editor DESPUES de v8. No borra nada.
-- Tercer tipo de movimiento: impuestos, aparte de ingresos y gastos.

alter table transactions drop constraint if exists transactions_type_check;
alter table transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'tax'));
