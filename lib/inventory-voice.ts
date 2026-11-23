import type { Catalog, InventoryCommand, Material } from "./types";

// 在庫の音声操作（友達の担当）。Step 0 はスタブ。
// シグネチャは契約なので、変えるときは必ず相談する。

// 発話から在庫コマンドを抽出する。Step 0 は常に unknown を返す。
export async function parseInventoryUtterance(
  transcript: string,
  _catalog: Catalog,
  _materials: Material[],
): Promise<InventoryCommand[]> {
  return [{ kind: "unknown", text: transcript }];
}

// 在庫コマンドを適用し、まとまり（changeId）と要約を返す。
export async function applyInventoryCommands(
  _commands: InventoryCommand[],
  _updatedBy: string,
): Promise<{ changeId: string; summary: string[] }> {
  return { changeId: "", summary: [] };
}

// 音声操作のまとまりを取り消す。
export async function undoInventoryChange(_changeId: string, _updatedBy: string): Promise<void> {
  // Step 0: 何もしない。
}
