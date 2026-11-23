import { withTransaction } from "@/lib/db/client";
import { revertConsumption } from "@/lib/db/materials";
import { cancelOrder } from "@/lib/db/orders";

// DB に書き込むため Node.js ランタイムで動かす。
export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return Response.json({ error: "注文が見つかりません。" }, { status: 400 });
    }

    const createdBy = "demo"; // Phase 9 でログイン中の店員名に置き換える
    const cancelled = await withTransaction(async (tx) => {
      const ok = await cancelOrder(tx, id);
      // 取り消せたときだけ在庫を戻す（同じトランザクション内）。
      if (ok) await revertConsumption(tx, id, createdBy);
      return ok;
    });

    if (!cancelled) {
      return Response.json({ error: "この注文は取り消せません（既に取り消し済みの可能性があります）。" }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[orders/cancel]", error);
    return Response.json({ error: "注文を取り消せませんでした。接続を確認して再試行してください。" }, { status: 502 });
  }
}
