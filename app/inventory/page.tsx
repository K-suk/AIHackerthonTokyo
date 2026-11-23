import AppHeader from "@/components/AppHeader";

export const metadata = { title: "在庫 — 声レジ" };

// 友達の担当（在庫管理）。Step 0 は仮ページ。
export default function InventoryPage() {
  return <main className="page">
    <AppHeader />
    <section className="page-body">
      <h1>在庫</h1>
      <p className="placeholder">準備中です（在庫管理：担当は別メンバー）。</p>
    </section>
  </main>;
}
