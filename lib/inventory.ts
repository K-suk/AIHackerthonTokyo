import type { AvailabilityNotice, Catalog, Ticket } from "./types";

// 在庫の純粋関数（友達の担当）。Step 0 はスタブ。
// シグネチャは契約なので、変えるときは必ず相談する。

// 伝票から材料の消費量を計算する（materialId -> 消費量）。
export function computeConsumption(_ticket: Ticket, _catalog: Catalog): Map<string, number> {
  return new Map();
}

// 品切れ・在庫不足の注意を返す。
export function checkAvailability(
  _ticket: Ticket,
  _catalog: Catalog,
  _stock: Record<string, number>,
): AvailabilityNotice[] {
  return [];
}
