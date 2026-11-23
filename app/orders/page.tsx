import AppHeader from "@/components/AppHeader";

export const metadata = { title: "本日の注文 — 声レジ" };

// Phase 5 で中身を実装する。
export default function OrdersPage() {
  return <main className="page">
    <AppHeader />
    <section className="page-body">
      <h1>本日の注文</h1>
      <p className="placeholder">準備中です（Phase 5 で実装）。</p>
    </section>
  </main>;
}
