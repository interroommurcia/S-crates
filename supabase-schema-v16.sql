-- Ejecutar en Supabase SQL Editor DESPUES de v15. No borra nada previo.
-- Permite ingresos fijos (recurrentes): rentas y cualquier ingreso periodico.
-- Antes recurring_expenses.type solo admitia 'expense' | 'tax'.

alter table recurring_expenses
  drop constraint if exists recurring_expenses_type_check;

alter table recurring_expenses
  add constraint recurring_expenses_type_check
  check (type in ('income', 'expense', 'tax'));
