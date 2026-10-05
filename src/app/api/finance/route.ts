import { supabaseAdmin } from "@/lib/supabase-server";
import {
  computeReport,
  monthRange,
  monthlySeries,
  ensureRecurringForMonth,
  type Transaction,
  type Ledger,
} from "@/lib/finance";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

// Campos que definen un fijo (sin fecha ni pending): se aplican a la plantilla
// y a todas sus transacciones hermanas para que todo quede vinculado.
function definitionFields(update: Row): Row {
  const d: Row = {};
  if (update.amount !== undefined) d.amount = update.amount;
  if (update.type === "income" || update.type === "expense" || update.type === "tax")
    d.type = update.type;
  if (update.category !== undefined) d.category = update.category;
  if ("subcategory" in update) d.subcategory = update.subcategory;
  if ("description" in update) d.description = update.description;
  if (update.account !== undefined) d.account = update.account;
  if (update.ledger !== undefined) d.ledger = update.ledger;
  return d;
}

// Campos de la plantilla fija (definicion + dia del mes desde la fecha).
function recurringFieldsFrom(update: Row): Row {
  const rUpd = definitionFields(update);
  if (typeof update.occurred_at === "string") {
    const day = Number(update.occurred_at.slice(8, 10));
    if (day >= 1) rUpd.day_of_month = Math.min(day, 28);
  }
  return rUpd;
}

// Propaga la edicion a la plantilla y a TODOS los movimientos de ese fijo
// (todos los meses, en personal y en rentas), sin tocar su fecha ni su pending.
async function syncRecurring(recId: string, update: Row): Promise<void> {
  const tpl = recurringFieldsFrom(update);
  if (Object.keys(tpl).length > 0)
    await supabaseAdmin.from("recurring_expenses").update(tpl).eq("id", recId);
  const siblings = definitionFields(update);
  if (Object.keys(siblings).length > 0)
    await supabaseAdmin.from("transactions").update(siblings).eq("recurring_id", recId);
}

// Crea una plantilla fija a partir de un movimiento ya guardado.
async function createRecurringFromTx(tx: Row): Promise<string | null> {
  const day = Number(String(tx.occurred_at).slice(8, 10)) || 1;
  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .insert({
      amount: Number(tx.amount),
      type: String(tx.type),
      category: tx.category ?? "otros",
      subcategory: tx.subcategory ?? null,
      description: tx.description ?? null,
      account: tx.account ?? "banco",
      ledger: tx.ledger ?? "personal",
      day_of_month: Math.min(Math.max(1, day), 28),
      property_id: tx.property_id ?? null,
    })
    .select("id")
    .single();
  if (error) return null;
  return data.id as string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { from, to } = monthRange(
    url.searchParams.get("month")
      ? new Date(`${url.searchParams.get("month")}-01T00:00:00Z`)
      : new Date()
  );

  const refDate = url.searchParams.get("month")
    ? new Date(`${url.searchParams.get("month")}-01T00:00:00Z`)
    : new Date();

  const ledgerParam = url.searchParams.get("ledger");
  const ledger: Ledger | undefined =
    ledgerParam === "personal" || ledgerParam === "empresa" ? ledgerParam : undefined;

  // Genera los gastos fijos de este mes si aun no existen.
  await ensureRecurringForMonth(refDate.toISOString().slice(0, 7));

  let txq = supabaseAdmin
    .from("transactions")
    .select("*")
    .gte("occurred_at", from)
    .lte("occurred_at", to)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (ledger) txq = txq.eq("ledger", ledger);

  const monthsParam = Number(url.searchParams.get("months"));
  const count = monthsParam === 12 ? 12 : 6;

  const [report, recent, series] = await Promise.all([
    computeReport(from, to, ledger),
    txq.then((r) => (r.data ?? []) as Transaction[]),
    monthlySeries(refDate, count, ledger, true),
  ]);

  return Response.json({ report, transactions: recent, series });
}

export async function POST(req: Request) {
  const body = await req.json();
  const amount = Number(body.amount);
  if (!(amount > 0)) return Response.json({ error: "Importe inválido" }, { status: 400 });

  const type: "income" | "expense" | "tax" =
    body.type === "income" ? "income" : body.type === "tax" ? "tax" : "expense";
  const category = String(body.category ?? "otros").trim().toLowerCase() || "otros";
  const subcategory = body.subcategory
    ? String(body.subcategory).trim().toLowerCase() || null
    : null;
  const description = body.description ? String(body.description).trim() || null : null;
  const account = body.account ? String(body.account).trim() || "efectivo" : "efectivo";
  const ledger: Ledger = body.ledger === "empresa" ? "empresa" : "personal";
  const occurred_at =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);
  const receipt_path =
    typeof body.receipt_path === "string" && body.receipt_path ? body.receipt_path : null;
  const property_id =
    typeof body.property_id === "string" && body.property_id ? body.property_id : null;
  // "Proximamente": solo aplica a ingresos por cobrar.
  const pending = type === "income" && body.pending === true;

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert({ amount, type, category, subcategory, description, account, ledger, occurred_at, receipt_path, property_id, pending })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Ingreso fijo: crea la plantilla y la enlaza.
  if (type === "income" && body.fixed === true && data) {
    const recId = await createRecurringFromTx(data as Row);
    if (recId) {
      await supabaseAdmin.from("transactions").update({ recurring_id: recId }).eq("id", data.id);
      (data as Row).recurring_id = recId;
    }
  }

  return Response.json({ ok: true, transaction: data });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const id = body.id;
  if (!id) return Response.json({ error: "id requerido" }, { status: 400 });

  // Actualiza solo los campos presentes (edicion) o marca cobrado (pending:false).
  const update: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (!(a > 0)) return Response.json({ error: "Importe inválido" }, { status: 400 });
    update.amount = a;
  }
  if (body.type === "income" || body.type === "expense" || body.type === "tax")
    update.type = body.type;
  if (typeof body.category === "string")
    update.category = body.category.trim().toLowerCase() || "otros";
  if ("subcategory" in body)
    update.subcategory = body.subcategory
      ? String(body.subcategory).trim().toLowerCase() || null
      : null;
  if ("description" in body)
    update.description = body.description ? String(body.description).trim() || null : null;
  if (typeof body.account === "string") update.account = body.account.trim() || "efectivo";
  if (body.ledger === "personal" || body.ledger === "empresa") update.ledger = body.ledger;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date))
    update.occurred_at = body.date;
  if (typeof body.pending === "boolean") update.pending = body.pending;

  if (Object.keys(update).length === 0)
    return Response.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const row = data as Row;
  const recId = row?.recurring_id as string | null | undefined;

  if (row?.type === "income" && typeof body.fixed === "boolean") {
    // Alta/baja/edicion de ingreso fijo desde el propio movimiento.
    if (body.fixed) {
      if (recId) {
        await syncRecurring(recId, update);
      } else {
        const newId = await createRecurringFromTx(row);
        if (newId) {
          await supabaseAdmin.from("transactions").update({ recurring_id: newId }).eq("id", id);
          row.recurring_id = newId;
        }
      }
    } else if (recId) {
      // Quitar el fijo: desactiva la plantilla y desvincula el movimiento.
      await supabaseAdmin.from("recurring_expenses").update({ active: false }).eq("id", recId);
      await supabaseAdmin.from("transactions").update({ recurring_id: null }).eq("id", id);
      row.recurring_id = null;
    }
  } else if (recId) {
    // Gasto/impuesto/ingreso fijo: propaga la edicion a la plantilla y hermanas.
    await syncRecurring(recId, update);
  }

  return Response.json({ ok: true, transaction: data });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();

  // Borra el PDF adjunto del bucket si existe
  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("receipt_path")
    .eq("id", id)
    .single();
  if (tx?.receipt_path) {
    await supabaseAdmin.storage.from("receipts").remove([tx.receipt_path]);
  }

  const { error } = await supabaseAdmin.from("transactions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
