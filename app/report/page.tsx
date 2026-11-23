import AppHeader from "@/components/AppHeader";
import { toBusinessDate } from "@/lib/business-date";
import { suggestOrders } from "@/lib/db/materials";
import { listOrdersByDate } from "@/lib/db/orders";
import { priceLabel } from "@/lib/menu";
import { summarizeOrders } from "@/lib/report";
import styles from "./report.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "日報 — 声レジ" };

async function readReport(businessDate: string) {
  try {
    const [orders, suggestions] = await Promise.all([
      listOrdersByDate(businessDate), suggestOrders(businessDate),
    ]);
    return { ...summarizeOrders(orders), suggestions };
  } catch {
    return null;
  }
}

export default async function ReportPage() {
  const businessDate = toBusinessDate(new Date());
  const report = await readReport(businessDate);
  return <main className="page">
    <AppHeader />
    <section className="page-body">
      <h1>日報 <small className="business-date">{businessDate}</small></h1>
      {report ? <>
        <dl className={styles.totals}>
          <div><dt>売上合計</dt><dd>{priceLabel(report.sales)}</dd></div>
          <div><dt>確定注文</dt><dd>{report.count}件</dd></div>
          <div><dt>取り消し</dt><dd>{report.cancelled}件</dd></div>
        </dl>
        <section className={styles.section} aria-labelledby="report-products">
          <h2 id="report-products">商品別の販売数</h2>
          {report.products.length ? <ul>{report.products.map(({ id, name, quantity }) =>
            <li key={id}><span>{name}</span><strong>{quantity}点</strong></li>)}</ul>
            : <p>本日の確定注文はまだありません。</p>}
        </section>
        <section className={styles.section} aria-labelledby="report-restock">
          <h2 id="report-restock">明日の発注予定</h2>
          {report.suggestions.length ? <ul>{report.suggestions.map((item) =>
            <li key={item.materialId}>
              <span>{item.name}</span><strong>{item.units}{item.unitLabel}</strong>
            </li>)}</ul>
            : <p>発注候補はありません。</p>}
        </section>
      </> : <p className="placeholder" role="alert">日報を読み込めませんでした。DBへの接続を確認してください。</p>}
    </section>
  </main>;
}
