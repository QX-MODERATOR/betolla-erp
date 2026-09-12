import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Inventory data layer. Reads/writes go through the caller's
 * own Supabase session (RLS-scoped — see
 * supabase/migrations/007_inventory_persistence.sql), matching the flat
 * shape app/inventory/page.tsx was already built around.
 */
export interface UiProduct {
  sku: string;
  name_ar: string;
  category: string;
  category_label: string;
  cost_price: number;
  price: number;
  sale_price: number | null;
  stock: number;
  reserved: number;
  reorder: number;
}

export interface UiMovement {
  id: string;
  date: string;
  sku: string;
  name: string;
  type: "in" | "out";
  type_label: string;
  qty: number;
  ref: string;
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase_in: "توريد بضاعة جديدة",
  sale_out: "صرف لطلبية مبيعات",
  return_in: "مرتجع من عميل",
  adjustment: "تسوية جرد",
  damaged: "تالف / عينات",
};

type OneOrMany<T> = T | T[] | null;

function one<T>(value: OneOrMany<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

interface ProductRow {
  sku: string;
  name_ar: string;
  retail_price: number;
  sale_price: number | null;
  cost_price: number;
  categories: OneOrMany<{ slug: string; name_ar: string }>;
  inventory: OneOrMany<{ quantity_on_hand: number; quantity_reserved: number; reorder_level: number }>;
}

function mapProductRow(row: ProductRow): UiProduct {
  const category = one(row.categories);
  const inv = one(row.inventory);
  return {
    sku: row.sku,
    name_ar: row.name_ar,
    category: category?.slug || "other",
    category_label: category?.name_ar || "غير مصنف",
    cost_price: Number(row.cost_price) || 0,
    price: Number(row.retail_price) || 0,
    sale_price: row.sale_price != null ? Number(row.sale_price) : null,
    stock: inv?.quantity_on_hand ?? 0,
    reserved: inv?.quantity_reserved ?? 0,
    reorder: inv?.reorder_level ?? 0,
  };
}

const PRODUCT_SELECT =
  "sku, name_ar, retail_price, sale_price, cost_price, categories(slug, name_ar), inventory(quantity_on_hand, quantity_reserved, reorder_level)";

export async function listProducts(supabase: SupabaseClient): Promise<UiProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("name_ar");

  if (error) throw error;
  return ((data as unknown as ProductRow[]) || []).map(mapProductRow);
}

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  products: OneOrMany<{ sku: string; name_ar: string }>;
}

function mapMovementRow(row: MovementRow): UiMovement {
  const product = one(row.products);
  return {
    id: row.id,
    date: new Date(row.created_at).toISOString().replace("T", " ").slice(0, 16),
    sku: product?.sku || "",
    name: product?.name_ar || "",
    type: row.quantity > 0 ? "in" : "out",
    type_label: MOVEMENT_TYPE_LABELS[row.movement_type] || row.movement_type,
    qty: row.quantity,
    ref: row.notes || "إدخال يدوي من لوحة التحكم",
  };
}

export async function listMovements(supabase: SupabaseClient): Promise<UiMovement[]> {
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("id, movement_type, quantity, notes, created_at, products(sku, name_ar)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data as unknown as MovementRow[]) || []).map(mapMovementRow);
}

const VALID_MOVEMENT_TYPES = new Set(["purchase_in", "sale_out", "return_in", "adjustment", "damaged"]);

export interface RecordMovementInput {
  sku: string;
  type: string;
  quantity: number;
  reference?: string;
  notes?: string;
}

export interface RecordMovementResult {
  movement: UiMovement;
  newQuantityOnHand: number;
  reorderLevel: number;
}

export async function recordMovement(supabase: SupabaseClient, input: RecordMovementInput): Promise<RecordMovementResult> {
  if (!input.sku || typeof input.sku !== "string") throw new Error("رمز المنتج (SKU) مطلوب.");
  if (!VALID_MOVEMENT_TYPES.has(input.type)) throw new Error("نوع حركة غير معروف.");

  const rawQty = Number(input.quantity);
  if (!Number.isFinite(rawQty) || rawQty === 0) throw new Error("الكمية غير صالحة.");

  // sale_out and damaged are always decreases; purchase_in/return_in are
  // always increases; adjustment carries whatever sign the caller sent
  // (it's the one type meant to correct a count either direction).
  const isAlwaysNegative = input.type === "sale_out" || input.type === "damaged";
  const isAlwaysPositive = input.type === "purchase_in" || input.type === "return_in";
  const signedQty = isAlwaysNegative ? -Math.abs(rawQty) : isAlwaysPositive ? Math.abs(rawQty) : rawQty;

  const { data, error } = await supabase.rpc("record_inventory_movement", {
    p_sku: input.sku,
    p_movement_type: input.type,
    p_quantity: signedQty,
    p_notes: input.reference || input.notes || null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("تعذر تسجيل حركة المخزون.");

  const { data: productRow } = await supabase.from("products").select("name_ar").eq("sku", input.sku).maybeSingle();

  return {
    movement: mapMovementRow({ ...row.movement, products: { sku: input.sku, name_ar: productRow?.name_ar || input.sku } }),
    newQuantityOnHand: row.new_quantity_on_hand,
    reorderLevel: row.reorder_level,
  };
}
