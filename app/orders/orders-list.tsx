"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { priceLabel } from "@/lib/menu";
import type { ConfirmedOrder } from "@/lib/types";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

function summarize(order: ConfirmedOrder): string {
  const parts = (order.ticket.lines ?? []).map((line) => line.name + "×" + line.item.quantity);
  return parts.join("、") || "（品目なし）";
}

export default function OrdersList({ orders }: { orders: ConfirmedOrder[] }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState("");

  const confirmed = orders.filter((order) => order.status === "confirmed");
  const salesTotal = confirmed.reduce((sum, order) => sum + order.total, 0);
  const phoneCount = confirmed.filter((order) => order.channel === "phone").length;

  async function cancel(id: string) {
    if (cancelling) return;
    setCancelling(id);
    setError("");
    try {
      const result = await fetch(`/api/orders/${id}/cancel`, { method: "POST" });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(payload.error ?? "取り消せませんでした。");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "取り消せませんでした。");
    } finally {
      setCancelling(null);
    }
  }

  return <div className="orders-view">
    <div className="orders-summary">
      <div><span>売上合計</span><strong>{priceLabel(salesTotal)}</strong></div>
      <div><span>確定注文</span><strong>{confirmed.length}件</strong></div>
      <div><span>うち電話</span><strong>{phoneCount}件</strong></div>
    </div>

    {error && <div className="error-banner" role="alert"><span>{error}</span></div>}

    {orders.length === 0 && <p className="placeholder">本日の確定注文はまだありません。</p>}

    <ul className="orders-list">
      {orders.map((order) => <li key={order.id} className="order-row" data-cancelled={order.status === "cancelled"}>
        <div className="order-main">
          <span className="order-time">{timeFormat.format(new Date(order.confirmedAt))}</span>
          <span className="order-channel" data-channel={order.channel}>{order.channel === "phone" ? "電話" : "対面"}</span>
          <span className="order-summary">{summarize(order)}</span>
        </div>
        <div className="order-side">
          <span className="order-total">{priceLabel(order.total)}</span>
          {order.status === "cancelled"
            ? <span className="order-cancelled-tag">取り消し済み</span>
            : <button type="button" className="order-cancel" disabled={cancelling === order.id}
                onClick={() => cancel(order.id)}>{cancelling === order.id ? "取消中…" : "取り消し"}</button>}
        </div>
      </li>)}
    </ul>
  </div>;
}
