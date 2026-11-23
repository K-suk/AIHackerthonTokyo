import AppHeader from "@/components/AppHeader";

export const metadata = { title: "メニュー管理 — 声レジ" };

// 友達の担当（メニュー管理）。Step 0 は仮ページ。
export default function AdminMenuPage() {
  return <main className="page">
    <AppHeader />
    <section className="page-body">
      <h1>メニュー管理</h1>
      <p className="placeholder">準備中です（メニュー管理：担当は別メンバー）。</p>
    </section>
  </main>;
}
