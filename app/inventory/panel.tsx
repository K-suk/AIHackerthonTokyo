"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import VoiceInput from "@/components/VoiceInput";
import type { Material, OrderSuggestion } from "@/lib/types";
import styles from "./inventory.module.css";

type MaterialRow = Material & { todayUsage: number };
type StockHistory = { id: string; name: string; unit: Material["unit"]; delta: number; reason: string; actor: string; at: string };
type Dashboard = {
  businessDate: string;
  materials: MaterialRow[];
  suggestions: OrderSuggestion[];
  history: StockHistory[];
  menuItems: { id: string; name: string; soldOut: boolean }[];
};
type VoiceResult = { changeId: string; summary: string[] };
const labels: Record<string, string> = { order: "注文", order_cancel: "注文取消", adjust: "在庫補正", voice_adjust: "音声補正" };
const formatTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const quantity = (amount: number, unit: Material["unit"]) =>
  `${amount.toLocaleString("ja-JP")}${unit === "pcs" ? "個" : unit}`;

export default function InventoryPanel({ staff, voiceEnabled, configured }: {
  staff: string[]; voiceEnabled: boolean; configured: boolean;
}) {
  const [operator, setOperator] = useState(staff[0]);
  const [passcode, setPasscode] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<VoiceResult | null>(null);
  const [transcript, setTranscript] = useState("");
  const [editing, setEditing] = useState<{ id: string; stock: string } | null>(null);
  const [filter, setFilter] = useState("");

  async function request<T>(path = "/api/inventory", method = "GET", data?: unknown): Promise<T> {
    const response = await fetch(path, {
      method, cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-store-passcode": encodeURIComponent(passcode),
        "x-store-staff": encodeURIComponent(operator),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "在庫情報を取得できませんでした。");
    return result as T;
  }

  async function refresh() {
    setDashboard(await request<Dashboard>());
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  function updateByVoice(text: string) {
    return run(async () => {
      const result = await request<VoiceResult>("/api/inventory/voice", "POST", { transcript: text });
      setTranscript("");
      setSummary(result);
      await refresh();
    });
  }

  function applyStock(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.stock.trim()) return;
    void run(async () => {
      await request("/api/inventory", "PATCH", { materialId: editing.id, stock: Number(editing.stock) });
      setEditing(null);
      await refresh();
    });
  }

  const normalizedFilter = filter.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
  const visibleMenu = dashboard?.menuItems.filter(({ name }) =>
    name.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(normalizedFilter)) ?? [];

  return <>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!dashboard ? <form className={styles.access} onSubmit={(event) => { event.preventDefault(); void run(refresh); }}>
      {!configured && <p>店舗パスコードを設定すると、在庫画面を開けます。</p>}
      <label>担当者
        <select value={operator} disabled={busy || !configured} onChange={(event) => setOperator(event.currentTarget.value)}>
          {staff.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label>店舗パスコード
        <input type="password" autoComplete="current-password" value={passcode}
          onChange={(event) => setPasscode(event.currentTarget.value)} disabled={busy || !configured} required />
      </label>
      <button type="submit" className={styles.primary} disabled={busy || !configured}>在庫を開く</button>
    </form> : <>
      <div className={styles.session}>
        <span>{dashboard.businessDate} 営業日 · {operator}</span>
        <div>
          <button type="button" disabled={busy} onClick={() => void run(refresh)}>更新</button>
          <button type="button" disabled={busy} onClick={() => {
            setDashboard(null); setPasscode(""); setSummary(null); setEditing(null); setError(""); setTranscript(""); setFilter("");
          }}>閉じる</button>
        </div>
      </div>
      {voiceEnabled && <VoiceInput label="在庫や品切れを話してください" onTranscript={(text) => void updateByVoice(text)} disabled={busy} />}
      <details className={styles.textInput}>
        <summary>在庫の指示を文字で入力</summary>
        <form onSubmit={(event) => { event.preventDefault(); if (transcript.trim()) void updateByVoice(transcript.trim()); }}>
          <label htmlFor="inventory-transcript">在庫の指示</label>
          <input id="inventory-transcript" value={transcript} maxLength={1200} placeholder="牛乳あと3本、チーズケーキ売り切れ"
            onChange={(event) => setTranscript(event.currentTarget.value)} disabled={busy} />
          <button type="submit" className={styles.primary} disabled={busy || !transcript.trim()}>反映</button>
        </form>
      </details>
      {summary && <div className={styles.result}>
        <ul role="status">{summary.summary.map((message, index) => <li key={index}>{message}</li>)}</ul>
        {summary.changeId && <button type="button" disabled={busy} onClick={() => void run(async () => {
          await request("/api/inventory/voice", "DELETE", { changeId: summary.changeId });
          setSummary({ changeId: "", summary: ["音声操作を取り消しました"] });
          await refresh();
        })}>取り消す</button>}
      </div>}
      <section className={styles.card} aria-labelledby="material-stock">
        <h2 id="material-stock">材料と発注候補</h2>
        {dashboard.materials.length === 0 ? <p>材料が登録されていません。</p> : <form onSubmit={applyStock}>
          <div className={styles.tableScroll} role="region" aria-label="材料の在庫表" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">材料</th><th scope="col">現在庫</th><th scope="col">発注点</th>
                <th scope="col">今日の使用</th><th scope="col">発注候補</th><th scope="col">補正</th></tr></thead>
              <tbody>{dashboard.materials.map((material) => {
                const suggestion = dashboard.suggestions.find(({ materialId }) => materialId === material.id);
                return <tr key={material.id} data-low={material.stock <= material.reorderPoint}>
                  <th scope="row">{material.name}</th>
                  <td data-negative={material.stock < 0}>
                    {editing?.id === material.id ? <input type="number" step="any" aria-label={`${material.name}の現在庫`} value={editing.stock}
                      onChange={(event) => setEditing({ id: material.id, stock: event.currentTarget.value })} disabled={busy} required /> :
                      quantity(material.stock, material.unit)}
                  </td>
                  <td>{quantity(material.reorderPoint, material.unit)}</td>
                  <td>{quantity(material.todayUsage, material.unit)}</td>
                  <td>{suggestion ? `${suggestion.units}${suggestion.unitLabel}` : "—"}</td>
                  <td>{editing?.id === material.id ? <>
                    <button key="save" className={styles.primary} type="submit" disabled={busy}>保存</button>
                    <button key="close" type="button" disabled={busy} onClick={() => setEditing(null)}>閉じる</button>
                  </> : <button key="edit" type="button" aria-label={`${material.name}を補正`} disabled={busy}
                    onClick={() => setEditing({ id: material.id, stock: String(material.stock) })}>補正</button>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </form>}
      </section>
      <section className={styles.card} aria-labelledby="sold-out-menu">
        <h2 id="sold-out-menu">商品の品切れ</h2>
        <label className={styles.filter}>商品を探す
          <input type="search" value={filter} onChange={(event) => setFilter(event.currentTarget.value)} />
        </label>
        {visibleMenu.length === 0 && <p>該当する商品がありません。</p>}
        <ul className={styles.menu}>
          {visibleMenu.map((item) => <li key={item.id}>
            <span>{item.name}</span>
            <button type="button" role="switch" aria-label={`${item.name}の品切れ`} aria-checked={item.soldOut}
              disabled={busy} onClick={() => void run(async () => {
                await request(`/api/menu/items/${encodeURIComponent(item.id)}/sold-out`, "PATCH", { soldOut: !item.soldOut });
                await refresh();
              })}>{item.soldOut ? "品切れ" : "販売中"}</button>
          </li>)}
        </ul>
      </section>
      <section className={styles.card} aria-labelledby="recent-stock">
        <h2 id="recent-stock">最近の在庫変更</h2>
        {dashboard.history.length === 0 && <p>変更履歴はまだありません。</p>}
        <ul className={styles.history}>{dashboard.history.map((entry) => <li key={entry.id}>
          <strong>{entry.name} {entry.delta > 0 && "＋"}{quantity(entry.delta, entry.unit)}</strong>
          <span>{formatTime.format(new Date(entry.at))} · {entry.actor} · {labels[entry.reason]}</span>
        </li>)}</ul>
      </section>
    </>}
  </>;
}
