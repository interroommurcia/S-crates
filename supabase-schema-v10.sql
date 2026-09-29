-- Ejecutar en Supabase SQL Editor DESPUES de v9. No borra nada.
-- Adjuntar factura (PDF) a un movimiento.

alter table transactions
  add column if not exists receipt_path text;

-- Bucket privado para las facturas. Solo accesible via service_role (backend).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
