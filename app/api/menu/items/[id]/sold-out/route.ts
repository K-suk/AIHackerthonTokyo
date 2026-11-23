import { z } from "zod";
import { revalidatePath } from "next/cache";
import { inventoryError, inventoryStaff } from "@/app/api/inventory/access";
import { clearCatalogCache, lockCatalog, writeLockedCatalog } from "@/lib/db/catalog";
import { withTransaction } from "@/lib/db/client";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const staff = await inventoryStaff(request);
    const { id } = await params;
    const body = z.object({ soldOut: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "品切れ状態を指定してください。" }, { status: 400 });
    const found = await withTransaction(async (tx) => {
      const catalog = await lockCatalog(tx);
      const entry = [...catalog.products, ...catalog.sets].find((item) => item.id === id && !item.discontinued);
      if (!entry) return false;
      if (Boolean(entry.soldOut) !== body.data.soldOut) {
        entry.soldOut = body.data.soldOut;
        await writeLockedCatalog(tx, catalog, staff);
      }
      return true;
    });
    if (!found) return Response.json({ error: "商品が見つかりません。" }, { status: 404 });
    clearCatalogCache();
    revalidatePath("/");
    revalidatePath("/admin/menu");
    return Response.json({ soldOut: body.data.soldOut });
  } catch (error) {
    return inventoryError(error);
  }
}
