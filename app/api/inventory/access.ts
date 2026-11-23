import { compare } from "bcryptjs";
import { InventorySpeechError } from "@/lib/inventory-voice";
import { StockChangeError } from "@/lib/db/materials";

class InventoryAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function staffNames() {
  const names = process.env.STAFF_NAMES?.split(",").map((name) => name.trim()).filter(Boolean) ?? [];
  return names.length ? [...new Set(names)] : ["店舗スタッフ"];
}

export async function inventoryStaff(request: Request): Promise<string> {
  const configured = process.env.STORE_PASSCODE_HASH;
  if (!configured) throw new InventoryAccessError("在庫管理には店舗パスコードの設定が必要です。", 503);
  const encoded = request.headers.get("x-store-passcode") ?? "";
  const actor = request.headers.get("x-store-staff") ?? "";
  let password = "";
  let staff = "";
  try {
    password = decodeURIComponent(encoded);
    staff = decodeURIComponent(actor);
  } catch {
    throw new InventoryAccessError("店舗パスコードを確認してください。", 401);
  }
  if (!password || Buffer.byteLength(password) > 72 || !await compare(password, configured)) {
    throw new InventoryAccessError("店舗パスコードを確認してください。", 401);
  }
  if (!staffNames().includes(staff)) throw new InventoryAccessError("担当者を選択してください。", 400);
  return staff;
}

export function inventoryError(error: unknown) {
  if (error instanceof InventoryAccessError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof StockChangeError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof InventorySpeechError) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ error: "在庫情報を処理できませんでした。DBの設定を確認してもう一度お試しください。" }, { status: 503 });
}
