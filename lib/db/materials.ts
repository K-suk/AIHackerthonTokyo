import type { OrderSuggestion } from "../types";
import type { Tx } from "./client";

// 材料・在庫のDBアクセス（友達の担当）。Step 0 はスタブ（何もしない / 空）。
// シグネチャは契約なので、変えるときは必ず相談する。

// 注文確定時、同じトランザクション内で在庫を減算する。
export async function applyConsumption(
  _tx: Tx,
  _orderId: string,
  _consumption: Map<string, number>,
  _createdBy: string,
): Promise<void> {
  // Step 0: 在庫は変えない。
}

// 注文取り消し時、減算を戻す。
export async function revertConsumption(_tx: Tx, _orderId: string, _createdBy: string): Promise<void> {
  // Step 0: 在庫は変えない。
}

// 在庫スナップショットを1クエリで取得する（materialId -> 在庫）。
export async function getStockSnapshot(): Promise<Record<string, number>> {
  return {};
}

// 当営業日の発注候補を返す。
export async function suggestOrders(_businessDate: string): Promise<OrderSuggestion[]> {
  return [];
}
