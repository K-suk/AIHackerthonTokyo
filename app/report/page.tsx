import AppHeader from "@/components/AppHeader";
import { toBusinessDate } from "@/lib/business-date";
import { getCatalog } from "@/lib/db/catalog";
import { listEventsByDate } from "@/lib/db/events";
import { suggestOrders } from "@/lib/db/materials";
import { listOrdersByDate } from "@/lib/db/orders";
import { getReport } from "@/lib/db/reports";
import { aggregateDay } from "@/lib/report";
import type { EventMemo } from "@/lib/types";
import ReportView, { type ReportSummary } from "./report-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "日報 — 声レジ" };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const businessDate = date && datePattern.test(date) ? date : toBusinessDate(new Date());

  let events: EventMemo[] = [];
  let summary: ReportSummary | null = null;
  let savedBody: string | null = null;
  let error: string | null = null;

  try {
    const [orders, loadedEvents, catalog, saved, suggestions] = await Promise.all([
      listOrdersByDate(businessDate),
      listEventsByDate(businessDate),
      getCatalog(),
      getReport(businessDate),
      suggestOrders(businessDate),
    ]);
    events = loadedEvents;
    savedBody = saved;
    const aggregate = aggregateDay(orders, loadedEvents);
    summary = {
      salesTotal: aggregate.salesTotal,
      orderCount: aggregate.orderCount,
      cancelledCount: orders.length - aggregate.orderCount,
      suggestions,
      counterCount: aggregate.counterCount,
      phoneCount: aggregate.phoneCount,
      itemQuantities: aggregate.itemQuantities,
      topOptions: aggregate.topOptionIds.map((option) => ({
        name: catalog.options[option.optionId]?.name ?? option.optionId,
        count: option.count,
      })),
      hourlyCounts: aggregate.hourlyCounts,
    };
  } catch {
    error = "日報データの読み込みに失敗しました。DB接続（DATABASE_URL）を確認してください。";
  }

  return <main className="page">
    <AppHeader />
    <section className="page-body report-page">
      {error || !summary
        ? <p className="placeholder" role="alert">{error ?? "データがありません。"}</p>
        : <ReportView
            businessDate={businessDate}
            summary={summary}
            events={events}
            savedBody={savedBody}
            reportTo={process.env.REPORT_TO_EMAIL || ""}
          />}
    </section>
  </main>;
}
