import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { insertEvent, listEventsByDate } from "@/lib/db/events";

export const runtime = "nodejs";

const categoryEnum = z.enum(["equipment", "customer", "staff", "other", "reflection"]);

const createSchema = z.object({
  text: z.string().trim().min(1).max(500),
  category: categoryEnum,
  needsAction: z.boolean().optional(),
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "出来事の内容を確認してください。" }, { status: 400 });
    const event = await insertEvent({
      businessDate: toBusinessDate(new Date()),
      text: parsed.data.text,
      category: parsed.data.category,
      needsAction: parsed.data.needsAction ?? false,
      createdBy: "demo", // Phase 9 で店員名に置き換える
    });
    return Response.json({ event });
  } catch (error) {
    console.error("[events POST]", error);
    return Response.json({ error: "出来事を保存できませんでした。" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  try {
    const dateParam = new URL(request.url).searchParams.get("date");
    const businessDate = dateParam && datePattern.test(dateParam) ? dateParam : toBusinessDate(new Date());
    const events = await listEventsByDate(businessDate);
    return Response.json({ businessDate, events });
  } catch (error) {
    console.error("[events GET]", error);
    return Response.json({ error: "出来事を読み込めませんでした。" }, { status: 502 });
  }
}
