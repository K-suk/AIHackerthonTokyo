import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { getCatalog } from "@/lib/db/catalog";
import { withTransaction } from "@/lib/db/client";
import { getMaterialUsage, orderSuggestions, recentStockMovements, setStock } from "@/lib/db/materials";
import { inventoryError, inventoryStaff } from "./access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await inventoryStaff(request);
    const businessDate = toBusinessDate(new Date());
    const [materials, history, catalog] = await Promise.all([
      getMaterialUsage(businessDate), recentStockMovements(), getCatalog(),
    ]);
    const menuItems = [...catalog.products, ...catalog.sets].filter(({ discontinued }) => !discontinued)
      .map(({ id, name, soldOut }) => ({ id, name, soldOut: Boolean(soldOut) }));
    return Response.json({ businessDate, materials, suggestions: orderSuggestions(materials), history, menuItems });
  } catch (error) {
    return inventoryError(error);
  }
}

const adjustment = z.object({ materialId: z.string().min(1), stock: z.number().finite() });

export async function PATCH(request: Request) {
  try {
    const staff = await inventoryStaff(request);
    const body = adjustment.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "材料と在庫数を確認してください。" }, { status: 400 });
    await withTransaction((tx) => setStock(tx, body.data.materialId, body.data.stock, staff));
    return Response.json({ ok: true });
  } catch (error) {
    return inventoryError(error);
  }
}
