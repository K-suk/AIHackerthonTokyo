import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { getReport, saveReport } from "@/lib/db/reports";

export const runtime = "nodejs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const saveSchema = z.object({
  businessDate: z.string().regex(datePattern),
  body: z.string().max(20000),
});

export async function GET(request: Request) {
  try {
    const dateParam = new URL(request.url).searchParams.get("date");
    const businessDate = dateParam && datePattern.test(dateParam) ? dateParam : toBusinessDate(new Date());
    const body = await getReport(businessDate);
    return Response.json({ businessDate, body });
  } catch (error) {
    console.error("[report GET]", error);
    return Response.json({ error: "日報を読み込めませんでした。" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = saveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "保存内容を確認してください。" }, { status: 400 });
    await saveReport(parsed.data.businessDate, parsed.data.body, "demo"); // Phase 9 で店員名に置き換える
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[report POST]", error);
    return Response.json({ error: "日報を保存できませんでした。" }, { status: 502 });
  }
}
