import { z } from "zod";
import { toBusinessDate } from "@/lib/business-date";
import { getCatalog } from "@/lib/db/catalog";
import { listEventsByDate } from "@/lib/db/events";
import { listOrdersByDate } from "@/lib/db/orders";
import { suggestOrders } from "@/lib/db/materials";
import { OrderServiceError } from "@/lib/interpret";
import { aggregateDay, assembleReport, eventCategoryLabel } from "@/lib/report";
import { draftReportProse } from "@/lib/report-ai";

export const runtime = "nodejs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const bodySchema = z.object({ businessDate: z.string().regex(datePattern).optional() });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const businessDate = parsed.success && parsed.data.businessDate ? parsed.data.businessDate : toBusinessDate(new Date());

    const [orders, events] = await Promise.all([listOrdersByDate(businessDate), listEventsByDate(businessDate)]);

    // 注文も出来事も無い日はLLMを呼ばない。
    if (orders.length === 0 && events.length === 0) {
      return Response.json({ businessDate, body: "本日の記録はありません。", empty: true });
    }

    const aggregate = aggregateDay(orders, events);
    const catalog = await getCatalog();
    const optionName = (id: string) => catalog.options[id]?.name ?? id;
    const storeName = process.env.STORE_NAME || "声レジカフェ";
    const suggestions = await suggestOrders(businessDate);

    // 文章部分だけLLM。数値や出来事はコードで整形して渡す。
    const summaryInput = JSON.stringify({
      salesTotal: aggregate.salesTotal,
      orderCount: aggregate.orderCount,
      counterCount: aggregate.counterCount,
      phoneCount: aggregate.phoneCount,
      itemQuantities: aggregate.itemQuantities,
      topOptions: aggregate.topOptionIds.map((option) => ({ name: optionName(option.optionId), count: option.count })),
      hourlyCounts: aggregate.hourlyCounts,
      // 出来事は整形済みの文字列で渡す（LLM がフィールド名を出力しないように）。要対応を先頭に。
      events: aggregate.events.map((event) =>
        (event.needsAction ? "【要対応】" : "") + eventCategoryLabel(event.category) + "：" + event.text),
    });
    const prose = await draftReportProse(summaryInput, request.signal);

    const body = assembleReport({ storeName, businessDate, aggregate, optionName, suggestions, prose });
    return Response.json({ businessDate, body, empty: false });
  } catch (error) {
    if (error instanceof OrderServiceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[report/draft]", error);
    return Response.json({ error: "日報の下書きを作成できませんでした。" }, { status: 502 });
  }
}
