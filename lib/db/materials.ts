import type { Material, OrderSuggestion } from "../types";
import { getSql } from "./client";
import type { Tx } from "./client";

export type MaterialUsage = Material & { todayUsage: number };
type StockReason = "order" | "order_cancel" | "adjust" | "voice_adjust";

export class StockChangeError extends Error {}

async function moveStock(
  tx: Tx, materialId: string, delta: number, reason: StockReason, actor: string,
  refs: { orderId?: string; changeId?: string } = {},
) {
  if (!delta) return;
  if (!Number.isFinite(delta)) throw new StockChangeError("在庫の変更量が入力範囲を超えています。");
  const [row] = await tx<{ id: string }[]>`
    update materials set stock = stock + ${delta}, updated_by = ${actor}, updated_at = clock_timestamp()
    where id = ${materialId} returning id
  `;
  if (!row) throw new StockChangeError("対象の材料が見つかりません。");
  await tx`
    insert into stock_movements (material_id, delta, reason, order_id, change_id, created_by, created_at)
    values (${materialId}, ${delta}, ${reason}, ${refs.orderId ?? null}, ${refs.changeId ?? null}, ${actor}, clock_timestamp())
  `;
}

export async function applyConsumption(
  tx: Tx,
  orderId: string,
  consumption: Map<string, number>,
  createdBy: string,
): Promise<void> {
  await tx`select id from orders where id = ${orderId} for update`;
  const [prior] = await tx`select 1 from stock_movements where order_id = ${orderId} and reason = 'order' limit 1`;
  if (prior) return;
  const materialIds = [...consumption.keys()].sort();
  if (!materialIds.length) return;
  const registered = await tx<{ id: string }[]>`select id from materials where id in ${tx(materialIds)}`;
  const registeredIds = new Set(registered.map(({ id }) => id));
  for (const materialId of materialIds) {
    if (!registeredIds.has(materialId)) continue;
    const qty = consumption.get(materialId) ?? 0;
    if (qty > 0) await moveStock(tx, materialId, -qty, "order", createdBy, { orderId });
  }
}

export async function revertConsumption(tx: Tx, orderId: string, createdBy: string): Promise<void> {
  await tx`select id from orders where id = ${orderId} for update`;
  const [prior] = await tx`select 1 from stock_movements where order_id = ${orderId} and reason = 'order_cancel' limit 1`;
  if (prior) return;
  const original = await tx<{ id: string; qty: number }[]>`
    select material_id as id, -sum(delta) as qty from stock_movements
    where order_id = ${orderId} and reason = 'order' group by material_id order by material_id collate "C"
  `;
  for (const { id, qty } of original) await moveStock(tx, id, qty, "order_cancel", createdBy, { orderId });
}

export async function getStockSnapshot(): Promise<Record<string, number>> {
  const sql = getSql();
  const rows = await sql<{ id: string; stock: number }[]>`select id, stock from materials`;
  return Object.fromEntries(rows.map(({ id, stock }) => [id, stock]));
}

export async function getMaterialUsage(businessDate: string): Promise<MaterialUsage[]> {
  const sql = getSql();
  return sql<MaterialUsage[]>`
    select m.id, m.name, m.unit, m.stock, m.reorder_point as "reorderPoint",
           m.order_unit as "orderUnit", m.order_unit_label as "orderUnitLabel",
           -coalesce(sum(s.delta), 0) as "todayUsage"
    from materials m
    left join stock_movements s on s.material_id = m.id
      and s.reason in ('order', 'order_cancel')
      and s.created_at >= ((${businessDate}::date + time '04:00') at time zone 'Asia/Tokyo')
      and s.created_at < ((${businessDate}::date + 1 + time '04:00') at time zone 'Asia/Tokyo')
    group by m.id
    order by (m.stock <= m.reorder_point) desc, m.name, m.id
  `;
}

export function orderSuggestions(materials: MaterialUsage[]): OrderSuggestion[] {
  return materials.flatMap(({ id, name, stock, todayUsage, reorderPoint, orderUnit, orderUnitLabel }) => {
    const needed = todayUsage + reorderPoint - stock;
    if (needed <= 0 || orderUnit <= 0) return [];
    return [{ materialId: id, name, stock, todayUsage, units: Math.ceil(needed / orderUnit), unitLabel: orderUnitLabel }];
  });
}

export async function suggestOrders(businessDate: string): Promise<OrderSuggestion[]> {
  return orderSuggestions(await getMaterialUsage(businessDate));
}

export async function listMaterials(): Promise<Material[]> {
  const sql = getSql();
  return sql<Material[]>`
    select id, name, unit, stock, reorder_point as "reorderPoint", order_unit as "orderUnit",
      order_unit_label as "orderUnitLabel" from materials order by name, id
  `;
}

export async function recentStockMovements() {
  const sql = getSql();
  return sql<{ id: string; name: string; unit: Material["unit"]; delta: number; reason: StockReason; actor: string; at: Date }[]>`
    select s.id, m.name, m.unit, s.delta, s.reason, s.created_by as actor, s.created_at as at
    from stock_movements s join materials m on m.id = s.material_id
    order by s.created_at desc, s.id limit 8
  `;
}

export async function setStock(
  tx: Tx, materialId: string, next: number, actor: string, changeId?: string,
): Promise<boolean> {
  if (!Number.isFinite(next)) throw new StockChangeError("在庫数は数値で入力してください。");
  const [material] = await tx<{ stock: number }[]>`select stock from materials where id = ${materialId} for update`;
  if (!material) throw new StockChangeError("対象の材料が見つかりません。");
  const delta = next - material.stock;
  await moveStock(tx, materialId, delta, changeId ? "voice_adjust" : "adjust", actor, { changeId });
  return delta !== 0;
}

export async function undoStockChange(tx: Tx, changeId: string, actor: string): Promise<boolean> {
  const original = await tx<{ id: string; materialId: string; delta: number; at: Date }[]>`
    select id, material_id as "materialId", delta, created_at as at from stock_movements
    where change_id = ${changeId} and reason = 'voice_adjust' order by material_id collate "C", created_at, id for update
  `;
  const [undone] = await tx`select 1 from stock_movements where change_id = ${changeId} and reason = 'adjust' limit 1`;
  if (!original.length || undone) return false;
  const totals = new Map<string, number>();
  for (const row of original) totals.set(row.materialId, (totals.get(row.materialId) ?? 0) + row.delta);
  for (const [id, delta] of totals) {
    await tx`select id from materials where id = ${id} for update`;
    const [later] = await tx`
      select 1 from stock_movements
      where material_id = ${id} and change_id is distinct from ${changeId} and reason in ('adjust', 'voice_adjust')
        and created_at > (select max(created_at) from stock_movements where material_id = ${id} and change_id = ${changeId})
      limit 1
    `;
    if (later) throw new StockChangeError("この操作の後に在庫が補正されています。現在の在庫を確認してください。");
    await moveStock(tx, id, -delta, "adjust", actor, { changeId });
  }
  return true;
}
