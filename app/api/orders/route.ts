import { interpretOrder, OrderServiceError } from "@/lib/interpret";
import { buildTicket, demos } from "@/lib/order";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ error: "注文を読み取れません。" }, { status: 400 });

    if (typeof body.sample === "string") {
      const demo = demos.find(({ id }) => id === body.sample);
      if (!demo) return Response.json({ error: "サンプルが見つかりません。" }, { status: 400 });
      return Response.json({ ticket: buildTicket(demo.order), transcript: demo.text });
    }

    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript || transcript.length > 1200) {
      return Response.json({ error: "注文の内容を1〜1,200文字で入力してください。" }, { status: 400 });
    }

    const order = await interpretOrder(transcript, request.signal);
    if (order.items.length === 0 && order.unparsed.length === 0) {
      return Response.json({ error: "注文が聞き取れませんでした。もう一度お試しください。" }, { status: 422 });
    }
    return Response.json({ ticket: buildTicket(order), transcript });
  } catch (error) {
    if (error instanceof OrderServiceError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "注文解析が時間内に終わりませんでした。再試行できます。" }, { status: 504 });
    }
    return Response.json({ error: "注文解析に失敗しました。再試行できます。" }, { status: 502 });
  }
}
