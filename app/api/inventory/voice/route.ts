import { z } from "zod";
import { getCatalog } from "@/lib/db/catalog";
import { listMaterials } from "@/lib/db/materials";
import { applyInventoryCommands, parseInventoryUtterance, undoInventoryChange } from "@/lib/inventory-voice";
import { inventoryError, inventoryStaff } from "../access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const staff = await inventoryStaff(request);
    const body = z.object({ transcript: z.string().trim().min(1).max(1200) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "在庫の指示を1〜1,200文字で入力してください。" }, { status: 400 });
    const [catalog, materials] = await Promise.all([getCatalog(), listMaterials()]);
    const commands = await parseInventoryUtterance(body.data.transcript, catalog, materials);
    return Response.json(await applyInventoryCommands(commands, staff));
  } catch (error) {
    return inventoryError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const staff = await inventoryStaff(request);
    const body = z.object({ changeId: z.uuid() }).safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "取り消す操作を指定してください。" }, { status: 400 });
    await undoInventoryChange(body.data.changeId, staff);
    return Response.json({ ok: true });
  } catch (error) {
    return inventoryError(error);
  }
}
