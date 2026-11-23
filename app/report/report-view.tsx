"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import VoiceInput from "@/components/VoiceInput";
import { eventCategoryLabel } from "@/lib/report";
import type { EventCategory, EventMemo } from "@/lib/types";

export type ReportSummary = {
  salesTotal: number;
  orderCount: number;
  counterCount: number;
  phoneCount: number;
  itemQuantities: { name: string; quantity: number }[];
  topOptions: { name: string; count: number }[];
  hourlyCounts: { hour: number; count: number }[];
};

const yen = (value: number) => "¥" + value.toLocaleString("ja-JP");
const eventCategories: EventCategory[] = ["equipment", "customer", "staff", "other"];

export default function ReportView({
  businessDate,
  summary,
  events,
  savedBody,
  reportTo,
}: {
  businessDate: string;
  summary: ReportSummary;
  events: EventMemo[];
  savedBody: string | null;
  reportTo: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(savedBody ?? "");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [busyEvent, setBusyEvent] = useState<string | null>(null);

  const happenings = events.filter((event) => event.category !== "reflection");
  const reflections = events.filter((event) => event.category === "reflection");

  async function send(url: string, init: RequestInit): Promise<unknown> {
    const result = await fetch(url, init);
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error((payload as { error?: string }).error ?? "失敗しました。");
    return payload;
  }

  async function generateDraft() {
    if (drafting) return;
    setDrafting(true);
    setError("");
    setNotice("");
    try {
      const payload = await send("/api/report/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDate }),
      }) as { body: string };
      setDraft(payload.body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "下書きを作成できませんでした。");
    } finally {
      setDrafting(false);
    }
  }

  async function saveDraft() {
    if (saving || !draft.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await send("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDate, body: draft }),
      });
      setNotice("日報を保存しました。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function addReflection(transcript: string) {
    setError("");
    try {
      await send("/api/report/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      setReflectionText("");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "振り返りを保存できませんでした。");
    }
  }

  function submitReflectionText(event: FormEvent) {
    event.preventDefault();
    if (reflectionText.trim()) void addReflection(reflectionText.trim());
  }

  async function patchEvent(id: string, patch: { category?: EventCategory; needsAction?: boolean }) {
    setBusyEvent(id);
    setError("");
    try {
      await send(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "更新できませんでした。");
    } finally {
      setBusyEvent(null);
    }
  }

  async function removeEvent(id: string) {
    setBusyEvent(id);
    setError("");
    try {
      await send(`/api/events/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "削除できませんでした。");
    } finally {
      setBusyEvent(null);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setNotice("コピーしました。");
    } catch {
      setError("コピーできませんでした。");
    }
  }

  function mailtoHref(): string {
    const [first, ...rest] = draft.split("\n");
    const subject = first.startsWith("件名：") ? first.slice(3) : "【日報】" + businessDate;
    const body = first.startsWith("件名：") ? rest.join("\n").trim() : draft;
    return "mailto:" + encodeURIComponent(reportTo) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  return <div className="report-view">
    <header className="report-header">
      <h1>日報</h1>
      <label className="report-date">営業日
        <input type="date" value={businessDate} onChange={(event) => router.push("/report?date=" + event.currentTarget.value)} />
      </label>
    </header>

    {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
    {notice && <div className="success-banner" role="status"><span>{notice}</span></div>}

    <section className="report-card">
      <h2>本日の実績</h2>
      <div className="orders-summary">
        <div><span>売上合計</span><strong>{yen(summary.salesTotal)}</strong></div>
        <div><span>注文件数</span><strong>{summary.orderCount}件</strong></div>
        <div><span>対面 / 電話</span><strong>{summary.counterCount} / {summary.phoneCount}</strong></div>
      </div>
      <p className="report-line"><b>品目別：</b>{summary.itemQuantities.map((item) => item.name + " " + item.quantity).join("、") || "なし"}</p>
      {summary.topOptions.length > 0 &&
        <p className="report-line"><b>よく出たカスタム：</b>{summary.topOptions.map((option) => option.name + " " + option.count + "回").join("、")}</p>}
    </section>

    <section className="report-card">
      <h2>出来事（{happenings.length}）</h2>
      {happenings.length === 0 && <p className="placeholder">記録された出来事はありません。</p>}
      <ul className="event-list">
        {happenings.map((event) => <li key={event.id} className="event-row" data-action={event.needsAction}>
          <div className="event-main">
            {event.needsAction && <span className="event-flag">要対応</span>}
            <span className="event-text">{event.text}</span>
          </div>
          <div className="event-controls">
            <select value={event.category} disabled={busyEvent === event.id}
              onChange={(e) => void patchEvent(event.id, { category: e.currentTarget.value as EventCategory })}>
              {eventCategories.map((category) => <option key={category} value={category}>{eventCategoryLabel(category)}</option>)}
            </select>
            <button type="button" disabled={busyEvent === event.id}
              onClick={() => void patchEvent(event.id, { needsAction: !event.needsAction })}>
              {event.needsAction ? "要対応を外す" : "要対応にする"}
            </button>
            <button type="button" className="event-delete" disabled={busyEvent === event.id}
              onClick={() => void removeEvent(event.id)}>削除</button>
          </div>
        </li>)}
      </ul>
    </section>

    <section className="report-card">
      <h2>店長の振り返り</h2>
      <VoiceInput label="今日の振り返りを話してください" onTranscript={(text) => void addReflection(text)} />
      <form className="text-entry" onSubmit={submitReflectionText}>
        <textarea value={reflectionText} onChange={(event) => setReflectionText(event.target.value)}
          maxLength={1200} rows={2} placeholder="テキストでも入力できます" />
        <button type="submit" disabled={!reflectionText.trim()}>振り返りに追加</button>
      </form>
      <ul className="reflection-list">
        {reflections.map((reflection) => <li key={reflection.id}>
          <span>{reflection.text}</span>
          <button type="button" className="event-delete" disabled={busyEvent === reflection.id}
            onClick={() => void removeEvent(reflection.id)}>削除</button>
        </li>)}
        {reflections.length === 0 && <li className="placeholder">まだ振り返りはありません。</li>}
      </ul>
    </section>

    <section className="report-card">
      <h2>日報の下書き</h2>
      <div className="report-actions">
        <button type="button" className="confirm-button" disabled={drafting} onClick={() => void generateDraft()}>
          {drafting ? "作成中…" : draft ? "作り直す" : "下書きを作成"}
        </button>
        <button type="button" disabled={!draft.trim()} onClick={() => void copyDraft()}>コピー</button>
        <a className="report-mail" href={draft.trim() ? mailtoHref() : undefined} aria-disabled={!draft.trim()}>メールで送る</a>
        <button type="button" disabled={saving || !draft.trim()} onClick={() => void saveDraft()}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      <textarea className="report-draft" value={draft} onChange={(event) => setDraft(event.target.value)}
        rows={16} placeholder="「下書きを作成」で日報の下書きを生成します。" />
    </section>
  </div>;
}
