import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { insertEvent } from "@/lib/db/events";
import { OrderServiceError } from "@/lib/interpret";
import { cleanReflection } from "@/lib/report-ai";

export const runtime = "nodejs";

const bodySchema = z.object({ transcript: z.string().trim().min(1).max(1200) });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "振り返りの内容を確認してください。" }, { status: 400 });

    const text = await cleanReflection(parsed.data.transcript, request.signal);
    if (!text) return Response.json({ error: "振り返りを読み取れませんでした。" }, { status: 422 });

    const event = await insertEvent({
      businessDate: toBusinessDate(new Date()),
      text,
      category: "reflection",
      needsAction: false,
      createdBy: "demo", // Phase 9 で店員名に置き換える
    });
    return Response.json({ event });
  } catch (error) {
    if (error instanceof OrderServiceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report/reflection]", error);
    return Response.json({ error: "振り返りを保存できませんでした。" }, { status: 502 });
  }
}
