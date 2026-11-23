import AppHeader from "@/components/AppHeader";
import { toBusinessDate } from "@/lib/business-date";
import { listOrdersByDate } from "@/lib/db/orders";
import type { ConfirmedOrder } from "@/lib/types";
import OrdersList from "./orders-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "本日の注文 — 声レジ" };

export default async function OrdersPage() {
  const businessDate = toBusinessDate(new Date());
  let orders: ConfirmedOrder[] = [];
  let error: string | null = null;
  try {
    orders = await listOrdersByDate(businessDate);
  } catch {
    error = "注文の読み込みに失敗しました。DB接続（DATABASE_URL）を確認してください。";
  }

  return <main className="page">
    <AppHeader />
    <section className="page-body orders-page">
      <header className="orders-heading">
        <h1>本日の注文</h1>
        <time dateTime={businessDate}>{businessDate}</time>
      </header>
      {error
        ? <p className="placeholder" role="alert">{error}</p>
        : <OrdersList orders={orders} />}
    </section>
  </main>;
}
