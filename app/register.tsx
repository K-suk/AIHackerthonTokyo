"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import AppHeader from "@/components/AppHeader";
import { priceLabel } from "@/lib/menu";
import { applyVoiceCancellations, buildTicket, confirmBlockReason, demos, emptyOrder, hasPickup, orderItem } from "@/lib/order";
import type { CancellationChoice, ParsedItem, ParsedOrder, Ticket, VoiceCancellation } from "@/lib/order";
import { eventCategoryLabel } from "@/lib/report";
import type { Catalog, ParsedEvent } from "@/lib/types";
import LineEditor from "./line-editor";
import { useRecording } from "./use-recording";

type Mode = "auto" | "order" | "event";
const modeLabels: Record<Mode, string> = { auto: "自動", order: "注文", event: "出来事" };

const categories = [
  { id: "all", label: "すべて" },
  { id: "set", label: "セット" },
  { id: "coffee", label: "コーヒー" },
  { id: "tea", label: "ティー・その他" },
  { id: "frozen", label: "フローズン" },
  { id: "seasonal", label: "期間限定" },
  { id: "pizza", label: "ピザ" },
  { id: "pasta", label: "パスタ" },
  { id: "food", label: "フード" },
] as const;

const queueStorageKey = "koe-register:pickups:v1";
const todayInTokyo = () => new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date());

type Pickup = { id: string; date: string; time: string; name: string; ticket: Ticket; transcript: string };
type Draft = {
  ticket: Ticket;
  transcript: string;
  pickupId?: string;
  cancellationChoices?: CancellationChoice[];
  cancellationNotice?: string;
};
type VoiceInput = { transcript: string } | { audio: Blob; recordingId: string };
type RequestInfo = { sample: string } | (VoiceInput & { additionTo?: Draft });
type Status = "ready" | "transcribing" | "analyzing" | "done" | "error";
type Category = typeof categories[number]["id"];

const emptyDraft: Draft = { ticket: buildTicket(emptyOrder), transcript: "" };

function ImageTile({ id, thumbnail = false }: { id: string; thumbnail?: boolean }) {
  const [failedId, setFailedId] = useState<string>();
  return <span className={thumbnail ? "thumbnail" : "product-photo"}>
    {failedId !== id && <Image src={"/menu/" + encodeURIComponent(id) + ".jpg"} alt="" fill unoptimized
      onError={() => setFailedId(id)} />}
  </span>;
}

function statusMessage(status: Status, recording: ReturnType<typeof useRecording>["state"], needsAttention: boolean) {
  if (recording === "requesting") return "マイクを準備中";
  if (recording === "recording") return "録音中";
  if (status === "transcribing") return "文字起こし中";
  if (status === "analyzing") return "注文を解析中";
  if (status === "error") return "再試行できます";
  if (needsAttention) return "要確認";
  if (status === "done") return "確認待ち";
  return "";
}

export default function Register({ browserRecording, catalog }: { browserRecording: boolean; catalog: Catalog }) {
  const [category, setCategory] = useState<Category>("all");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [editor, setEditor] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState("");
  const [textEntry, setTextEntry] = useState(false);
  const [text, setText] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmNotice, setConfirmNotice] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [eventNotice, setEventNotice] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const retryRef = useRef<RequestInfo | null>(null);
  const confirmKeyRef = useRef<string | null>(null);
  const waveformRef = useRef<HTMLSpanElement>(null);
  const pickupPanelRef = useRef<HTMLDetailsElement>(null);

  const ticket = draft.ticket;
  const { order } = ticket;
  const hasTicket = ticket.lines.length > 0 || order.unparsed.length > 0;
  const recording = useRecording(
    (audio) => void run({ audio, recordingId: crypto.randomUUID(), additionTo: hasTicket ? draft : undefined }),
    fail,
    (level) => waveformRef.current?.style.setProperty("--level", String(Math.min(1.22, .35 + level * 6))),
  );
  const busy = status === "transcribing" || status === "analyzing";
  const capturing = recording.state !== "idle";
  const showPickupForm = hasTicket && hasPickup(order);
  const needsPickupDetails = showPickupForm && (!order.customerName?.trim() || !order.pickupTime);
  const needsAttention = Boolean(draft.cancellationChoices?.length) || (hasTicket && (ticket.total === null || needsPickupDetails));
  const message = statusMessage(status === "done" && !hasTicket ? "ready" : status, recording.state, needsAttention);
  const blockReason = confirmBlockReason(ticket);
  const canConfirm = hasTicket && blockReason === null && !busy && !capturing && !confirming && !draft.cancellationChoices?.length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(queueStorageKey);
      if (saved) setPickups(JSON.parse(saved) as Pickup[]);
    } catch {
      // A fresh session works when browser storage is unavailable.
    }
    return () => requestRef.current?.abort();
  }, []);

  function savePickups(next: Pickup[]) {
    setPickups(next);
    try {
      window.localStorage.setItem(queueStorageKey, JSON.stringify(next));
    } catch {
      // The current session still retains its pickup list.
    }
  }

  function updateDraft(nextDraft: Draft) {
    const { order: nextOrder, total } = nextDraft.ticket;
    if (hasPickup(nextOrder) && !hasPickup(draft.ticket.order) && pickupPanelRef.current) {
      pickupPanelRef.current.open = true;
    }
    const name = nextOrder.customerName?.trim();
    if (total !== null && name && nextOrder.pickupTime) {
      const id = nextDraft.pickupId ?? crypto.randomUUID();
      const pickup: Pickup = {
        id,
        name,
        time: nextOrder.pickupTime,
        date: nextOrder.pickupDate ?? todayInTokyo(),
        ticket: nextDraft.ticket,
        transcript: nextDraft.transcript,
      };
      savePickups([...pickups.filter((entry) => entry.id !== id), pickup].sort((a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time)));
      setDraft({ ...nextDraft, pickupId: id });
      return;
    }
    if (nextDraft.pickupId && nextOrder.items.length === 0 && nextOrder.unparsed.length === 0) {
      savePickups(pickups.filter((entry) => entry.id !== nextDraft.pickupId));
      setDraft({ ...nextDraft, pickupId: undefined });
      return;
    }
    setDraft(nextDraft);
  }

  function fail(message: string) {
    setError(message);
    setStatus("error");
    setCanRetry(Boolean(retryRef.current));
  }

  async function run(info: RequestInfo) {
    if (requestRef.current) return;
    const request = new AbortController();
    requestRef.current = request;
    const deadline = window.setTimeout(() => request.abort(new DOMException("Order processing timed out", "TimeoutError")), "audio" in info ? 36_000 : 10_000);
    retryRef.current = info;
    setCanRetry(false);
    setError("");
    setConfirmNotice("");
    setEventNotice("");
    setEditor(null);

    try {
      const base = "additionTo" in info ? info.additionTo : undefined;
      const existingItems = base?.ticket.lines.map((line) => [line.name + " ×" + line.item.quantity, ...line.details].join("、"));
      let body: { sample: string } | { transcript: string; existingItems?: string[]; mode?: Mode };
      if ("audio" in info) {
        setStatus("transcribing");
        const form = new FormData();
        form.set("audio", info.audio, "order");
        form.set("recordingId", info.recordingId);
        const result = await fetch("/api/transcribe", { method: "POST", body: form, signal: request.signal });
        const payload = await result.json();
        if (!result.ok) throw new Error(payload.error);
        const transcript = String(payload.text);
        retryRef.current = { transcript, additionTo: base };
        if (!base) setDraft((previous) => ({ ...previous, transcript }));
        body = { transcript, existingItems, mode };
      } else if ("transcript" in info) {
        if (!base) setDraft((previous) => ({ ...previous, transcript: info.transcript }));
        body = { transcript: info.transcript, existingItems, mode };
      } else {
        body = info;
      }

      setStatus("analyzing");
      const result = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.signal,
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error);

      // 発話の振り分け：出来事は記録、在庫は準備中。どちらも伝票には触れない。
      if (payload.intent === "event" && payload.event) {
        const parsedEvent = payload.event as ParsedEvent;
        await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: parsedEvent.text, category: parsedEvent.category, needsAction: parsedEvent.needsAction }),
        }).catch(() => {});
        setEventNotice("出来事を記録しました（" + eventCategoryLabel(parsedEvent.category) + (parsedEvent.needsAction ? "・要対応" : "") + "）：" + parsedEvent.text);
        retryRef.current = null;
        setTextEntry(false);
        setText("");
        setStatus("done");
        return;
      }
      if (payload.intent === "inventory") {
        setEventNotice("在庫の操作は準備中です。");
        retryRef.current = null;
        setTextEntry(false);
        setText("");
        setStatus("done");
        return;
      }

      const nextTicket = payload.ticket as Ticket;
      const cancellations: VoiceCancellation[] = payload.cancellations ?? [];
      if (base) {
        const previous = base.ticket.order;
        const added = nextTicket.order;
        const revised = applyVoiceCancellations(base.ticket, cancellations, catalog);
        updateDraft({
          ...base,
          ticket: buildTicket({
            items: [...revised.items, ...added.items],
            unparsed: [...previous.unparsed, ...added.unparsed],
            pickupRequested: hasPickup(previous) || hasPickup(added),
            customerName: previous.customerName || added.customerName,
            pickupTime: previous.pickupTime || added.pickupTime,
            pickupDate: previous.pickupDate || added.pickupDate,
          }, catalog),
          transcript: [base.transcript, payload.transcript].filter(Boolean).join("\n"),
          cancellationChoices: revised.choices,
          cancellationNotice: revised.removedCount ? "注文を取り消しました。" : undefined,
        });
      } else {
        updateDraft({
          ticket: nextTicket,
          transcript: payload.transcript,
          cancellationNotice: cancellations.length > 0 ? "注文を取り消しました。" : undefined,
        });
      }
      retryRef.current = null;
      setTextEntry(false);
      setText("");
      setStatus("done");
    } catch (failure) {
      if (request.signal.reason?.name === "TimeoutError") {
        fail("処理が時間内に終わりませんでした。再試行できます。");
      } else if (!request.signal.aborted) {
        fail(failure instanceof Error ? failure.message : "注文を読み取れませんでした。");
      }
    } finally {
      window.clearTimeout(deadline);
      if (requestRef.current === request) requestRef.current = null;
    }
  }

  function editOrder(patch: Partial<ParsedOrder>) {
    updateDraft({ ...draft, ticket: buildTicket({ ...order, ...patch }, catalog), cancellationChoices: undefined, cancellationNotice: undefined });
    setStatus("done");
  }

  function resolveCancellation(index: number, item?: ParsedItem) {
    const remaining = (draft.cancellationChoices ?? [])
      .filter((_, position) => position !== index)
      .map((choice) => ({ ...choice, candidates: choice.candidates.filter((line) => line.item !== item) }));
    updateDraft({
      ...draft,
      ticket: item ? buildTicket({ ...order, items: order.items.filter((line) => line !== item) }, catalog) : ticket,
      cancellationChoices: remaining,
      cancellationNotice: item ? "注文を取り消しました。" : draft.cancellationNotice,
    });
  }

  function updateItem(index: number, patch: Partial<ParsedItem>) {
    editOrder({ items: order.items.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }

  function addProduct(id: string) {
    const index = order.items.length;
    editOrder({ items: [...order.items, orderItem({ menuId: id })] });
    setEditor(index);
  }

  function toggleRecording() {
    if (recording.state === "recording") {
      recording.finish();
      return;
    }
    if (recording.state === "requesting") {
      recording.cancel();
      return;
    }
    setError("");
    setCanRetry(false);
    retryRef.current = null;
    setStatus("ready");
    setEditor(null);
    if (!browserRecording) {
      fail("録音にはAqua VoiceのAPIキーが必要です。サンプル注文で画面を確認できます。");
      return;
    }
    void recording.start();
  }

  function submitText(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) void run({ transcript: text.trim() });
  }

  function newOrder() {
    setDraft(emptyDraft);
    setEditor(null);
    setTextEntry(false);
    setText("");
    setError("");
    setConfirmNotice("");
    setEventNotice("");
    setCanRetry(false);
    retryRef.current = null;
    setStatus("ready");
    if (pickupPanelRef.current) pickupPanelRef.current.open = false;
  }

  // 注文を確定してDBに保存する。送るのは解析結果（手修正込み）で、金額はサーバが再計算する。
  // 二重確定を防ぐため、同じ伝票では同じ Idempotency-Key を使い回す。
  async function confirm() {
    if (confirming || !canConfirm) return;
    setConfirming(true);
    setError("");
    const key = confirmKeyRef.current ?? (confirmKeyRef.current = crypto.randomUUID());
    try {
      const result = await fetch("/api/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, idempotencyKey: key }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error);
      confirmKeyRef.current = null;
      if (draft.pickupId) savePickups(pickups.filter((entry) => entry.id !== draft.pickupId));
      newOrder();
      setConfirmNotice("注文を確定しました（合計 " + priceLabel(payload.total) + "）");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "注文を確定できませんでした。もう一度お試しください。");
      setStatus("error");
    } finally {
      setConfirming(false);
    }
  }

  const section = [...catalog.products, ...catalog.sets.map((set) => ({ ...set, category: "set" }))]
    .filter((product) => !product.discontinued && (category === "all" || product.category === category));
  const loading = busy || capturing;

  return <main className="register">
    <header className="toolbar">
      <h1 className="brand"><Image src="/koereji-logo.svg" alt="声レジ" width={60} height={60} unoptimized /></h1>
      <button type="button" className="record-button" data-recording={capturing} disabled={busy} onClick={toggleRecording}>
        <span className="mic" aria-hidden="true" />
        {recording.state === "recording" ? "録音を終了" : capturing ? "マイク準備を取り消す" : hasTicket ? "追加・取消を録音" : "録音開始"}
      </button>
    </header>
    <AppHeader />

    <div className="work-area">
      <section className="capture-bar" aria-label="音声入力">
        <span className="waveform" ref={waveformRef} data-active={recording.state === "recording"} aria-hidden="true">
          {[4, 8, 15, 10, 20, 12, 7].map((height, index) => <i key={index} style={{ height }} />)}
        </span>
        <div className="transcript" aria-live="polite">
          {recording.state === "recording" ? "注文の会話を録音中。会話が終わったら「録音を終了」を押せます。" : draft.transcript || "お客さんの注文や店員とのやり取りを録音できます"}
        </div>
        <span className="voice-provider">Aqua Voice</span>
        {recording.state === "recording" ?
          <button type="button" className="text-button" onClick={recording.cancel}>録音を取り消す</button> :
          <button type="button" className="text-button" disabled={loading}
            onClick={() => { setText(draft.transcript); setTextEntry(!textEntry); }} aria-expanded={textEntry}>テキスト入力</button>}
      </section>

      <div className="mode-toggle" role="group" aria-label="入力の種類">
        <span className="mode-label">入力の種類</span>
        {(Object.keys(modeLabels) as Mode[]).map((value) => <button key={value} type="button"
          aria-pressed={mode === value} disabled={loading} onClick={() => setMode(value)}>{modeLabels[value]}</button>)}
      </div>

      {eventNotice && <div className="event-card" role="status">
        <span>{eventNotice}</span>
        <button type="button" onClick={() => setEventNotice("")}>閉じる</button>
      </div>}

      {textEntry && <form className="text-entry" onSubmit={submitText}>
        <label htmlFor="order-transcript">注文内容</label>
        <textarea id="order-transcript" value={text} onChange={(event) => setText(event.target.value)} maxLength={1200} rows={2} />
        <button type="submit" disabled={!text.trim() || loading}>注文に反映</button>
      </form>}

      {error && <div className="error-banner" role="alert">
        <span>{error}</span>
        {canRetry && <button type="button" disabled={loading} onClick={() => { if (retryRef.current) void run(retryRef.current); }}>再試行</button>}
      </div>}

      {confirmNotice && !hasTicket && <div className="success-banner" role="status"><span>{confirmNotice}</span></div>}

      <div className="workspace">
        <section className="menu-panel" aria-label="メニュー">
          <div className="menu-toolbar">
            <div className="category-list" role="group" aria-label="メニューのカテゴリ">
              {categories.map(({ id, label }) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}
            </div>
            <div className="samples">
              {demos.filter((sample) => sample.id !== "phone").map((sample) => <button key={sample.id} type="button" disabled={loading}
                onClick={() => void run({ sample: sample.id })}>{sample.label}</button>)}
            </div>
          </div>
          <div key={category} className="product-grid" role="region" aria-label="商品一覧" tabIndex={0}>
            {section.map((product) => {
              const count = order.items.filter((item) => item.menuId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              return <button type="button" key={product.id} className="product-card" data-selected={count > 0} disabled={loading}
                onClick={() => addProduct(product.id)} aria-label={product.name + "を追加"}>
                <ImageTile id={product.id} />
                {count > 0 && <span className="product-count" aria-label={"注文数 " + count}>{count}</span>}
                <span className="product-info"><strong>{product.name}</strong><span>{priceLabel(product.price)}</span></span>
              </button>;
            })}
          </div>
        </section>

        <aside className="order-column" aria-label="現在の注文">
          <section className="ticket-panel" aria-labelledby="ticket-heading">
            <header className="ticket-heading">
              <h2 id="ticket-heading">注文チケット</h2>
              <span className="status" data-status={needsAttention ? "attention" : busy ? "busy" : status} role="status">
                {message && <><i aria-hidden="true" />{message}</>}
              </span>
            </header>

            <div className="ticket-items">
              {draft.cancellationNotice && <p className="ticket-notice" role="status">{draft.cancellationNotice}</p>}
              {draft.cancellationChoices?.map((choice, index) => <div key={index} className="inline-warning" data-uncertain="true">
                <p>{choice.candidates.length ? "「" + choice.target + "」の取り消し対象を選んでください。" : "「" + choice.target + "」に該当する商品が伝票にありません。"}</p>
                <div className="option-buttons">
                  {choice.candidates.map((line, position) => <button type="button" disabled={loading} key={position}
                    onClick={() => resolveCancellation(index, line.item)}>
                    {line.name} ×{line.item.quantity}{line.details.length > 0 ? "（" + line.details.join("・") + "）" : ""}
                  </button>)}
                  <button type="button" disabled={loading} onClick={() => resolveCancellation(index)}>閉じる</button>
                </div>
              </div>)}
              {!hasTicket && <div className="empty-order"><span aria-hidden="true">▤</span><p>まだ注文がありません</p></div>}
              {ticket.lines.map((line, index) => <article key={index} className="ticket-line">
                <button type="button" className="line-summary" disabled={loading} aria-expanded={editor === index}
                  aria-controls={editor === index ? "line-" + index + "-editor" : undefined}
                  onClick={() => setEditor(editor === index ? null : index)}>
                  {line.imageId ? <ImageTile id={line.imageId} thumbnail /> : <span className="thumbnail missing" aria-hidden="true">?</span>}
                  <span className="line-description">
                    <strong>{line.name}</strong>
                    {line.details.map((detail) => <small key={detail}>{detail}</small>)}
                  </span>
                  <span className="line-quantity">×{line.item.quantity}</span>
                  <span className="line-price">
                    <span className="line-amount">{line.amount === null ? "—" : priceLabel(line.amount)}</span>
                    <span className="line-edit-label">{editor === index ? "閉じる" : "編集"}</span>
                  </span>
                </button>
                {line.issues.map((issue, issueIndex) => <div className="inline-warning" data-uncertain={issue.uncertain} key={issueIndex}>
                  <p>{issue.message}</p>
                  {issue.choices.length > 0 && <div className="option-buttons">
                    {issue.choices.map((choice) => <button type="button" disabled={loading} key={choice.label}
                      onClick={() => updateItem(index, choice.patch)}>{choice.label}</button>)}
                  </div>}
                </div>)}
                {editor === index && <LineEditor catalog={catalog} index={index} item={line.item} disabled={loading}
                  onChange={(patch) => updateItem(index, patch)}
                  onRemove={() => { editOrder({ items: order.items.filter((_, i) => i !== index) }); setEditor(null); }} />}
              </article>)}

              {order.unparsed.length > 0 && <div className="inline-warning unparsed">
                <p>確認できなかった内容</p>
                <ul>{order.unparsed.map((value, index) => <li key={index}>{value}</li>)}</ul>
                <button type="button" disabled={loading} onClick={() => { setText(draft.transcript); setTextEntry(true); }}>入力を直す</button>
              </div>}
            </div>

            <footer className="ticket-footer">
              <div><span>合計</span><strong>{ticket.total === null ? (hasTicket ? "—" : "¥0") : priceLabel(ticket.total)}</strong></div>
              {hasTicket && !showPickupForm && !needsAttention && !loading &&
                <p className="counter-next-step">内容と合計を確認して、注文を確定します。</p>}
              {hasTicket && blockReason && !loading &&
                <p className="confirm-hint">{blockReason}</p>}
              {hasTicket && <div className="ticket-actions">
                <button type="button" disabled={loading || confirming} onClick={newOrder}>次の注文を始める</button>
                <button type="button" className="confirm-button" disabled={!canConfirm}
                  onClick={() => void confirm()}>{confirming ? "確定中…" : "注文を確定"}</button>
              </div>}
            </footer>
          </section>

          <details ref={pickupPanelRef} className="pickup-panel">
            <summary>店頭受取の予約{pickups.length > 0 && <span className="pickup-count">（{pickups.length}件）</span>}</summary>
            <div className="pickup-tools">
              {hasTicket && !showPickupForm && <button type="button" disabled={loading}
                onClick={() => editOrder({ pickupRequested: true })}>現在の伝票に予約情報を追加</button>}
              <button type="button" disabled={loading} onClick={() => void run({ sample: "phone" })}>受取サンプル</button>
            </div>
            {showPickupForm && <div className="pickup-form">
              <label>お名前
                <input value={order.customerName ?? ""} disabled={loading} placeholder="未入力"
                  onChange={(event) => editOrder({ customerName: event.currentTarget.value || null })} />
              </label>
              <label>受取時刻
                <input type="time" value={order.pickupTime ?? ""} disabled={loading}
                  onChange={(event) => editOrder({ pickupTime: event.currentTarget.value || null })} />
              </label>
              <label className="pickup-date">受取日
                <input type="date" value={order.pickupDate ?? todayInTokyo()} disabled={loading}
                  onChange={(event) => editOrder({ pickupDate: event.currentTarget.value || null })} />
              </label>
              {needsPickupDetails && <p>受取リストに追加するには、名前と受取時刻を確認してください。</p>}
            </div>}
            <section aria-labelledby="pickup-heading">
              <h2 id="pickup-heading">受取リスト</h2>
              {pickups.length === 0 && <p className="pickup-empty">受取予定はありません</p>}
              {pickups.map((pickup) => <div key={pickup.id} className="pickup-row" data-current={pickup.id === draft.pickupId}>
                <button type="button" disabled={loading} className="pickup-select" onClick={() => {
                  setDraft({ ticket: pickup.ticket, transcript: pickup.transcript, pickupId: pickup.id });
                  setEditor(null);
                  setStatus("done");
                }}>
                  <strong>{pickup.time}</strong><span>{pickup.name}</span>
                  {pickup.date !== todayInTokyo() && <small>{pickup.date.slice(5).replace("-", "/")}</small>}
                </button>
                <button type="button" disabled={loading} className="pickup-done" onClick={() => {
                  savePickups(pickups.filter((item) => item.id !== pickup.id));
                  if (draft.pickupId === pickup.id) newOrder();
                }}>受取済み</button>
              </div>)}
            </section>
          </details>
        </aside>
      </div>
    </div>
  </main>;
}
