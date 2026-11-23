import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { getCatalog } from "@/lib/db/catalog";
import { withTransaction } from "@/lib/db/client";
import { applyConsumption } from "@/lib/db/materials";
import { getCatalogVersion, insertOrder } from "@/lib/db/orders";
import { computeConsumption } from "@/lib/inventory";
import { buildTicket, confirmBlockReason, hasPickup } from "@/lib/order";

// DB に書き込むため Node.js ランタイムで動かす。
export const runtime = "nodejs";

// クライアントから来る注文（解析結果＋手修正）。金額は受け取らず、サーバで再計算する。
const itemSchema = z.object({
  raw: z.string().max(200),
  menuId: z.string().max(80).nullable(),
  quantity: z.number().int().min(1).max(99),
  size: z.enum(["S", "T", "G"]).nullable(),
  temperature: z.enum(["hot", "ice"]).nullable(),
  drinkId: z.string().max(80).nullable(),
  optionIds: z.array(z.string().max(80)).max(20),
  candidateIds: z.array(z.string().max(80)).max(10),
  uncertain: z.boolean(),
});

const orderSchema = z.object({
  items: z.array(itemSchema).max(50),
  pickupRequested: z.boolean().optional(),
  customerName: z.string().max(80).nullable(),
  pickupTime: z.string().max(10).nullable(),
  pickupDate: z.string().max(10).nullable(),
  unparsed: z.array(z.string().max(200)).max(50),
});

const bodySchema = z.object({
  order: orderSchema,
  idempotencyKey: z.string().regex(/^[\w-]{1,80}$/),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "注文の内容を確認してください。" }, { status: 400 });
    }
    const { order, idempotencyKey } = parsed.data;

    // サーバで最新カタログを使って再計算する。クライアントの金額は使わない。
    const catalog = await getCatalog();
    const ticket = buildTicket(order, catalog);

    const blockReason = confirmBlockReason(ticket);
    if (blockReason) {
      return Response.json({ error: blockReason }, { status: 422 });
    }

    const total = ticket.total as number; // confirmBlockReason が null を保証
    const channel = hasPickup(order) ? "phone" : "counter";
    const businessDate = toBusinessDate(new Date());
    const createdBy = "demo"; // Phase 9 でログイン中の店員名に置き換える
    const consumption = computeConsumption(ticket, catalog);

    const result = await withTransaction(async (tx) => {
      const catalogVersion = await getCatalogVersion(tx);
      const { id, alreadyExisted } = await insertOrder(tx, {
        businessDate,
        channel,
        ticket,
        total,
        catalogVersion,
        idempotencyKey,
        createdBy,
      });
      // 新規確定のときだけ在庫を減算する（二重確定では減らさない）。
      if (!alreadyExisted) await applyConsumption(tx, id, consumption, createdBy);
      return { id, alreadyExisted };
    });

    return Response.json({ id: result.id, total, channel, businessDate, alreadyExisted: result.alreadyExisted });
  } catch (error) {
    console.error("[orders/confirm]", error);
    return Response.json({ error: "注文を確定できませんでした。接続を確認して再試行してください。" }, { status: 502 });
  }
}
