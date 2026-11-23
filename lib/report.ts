import type { ConfirmedOrder, DayAggregate, EventMemo, OrderSuggestion } from "./types";

// 日報の集計（純粋関数）。数値はすべてここで計算する。LLM には渡さない。
// 入力は確定済み注文（取り消しは内部で除外）と、当営業日の出来事。

const hourFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  hour12: false,
});

function tokyoHour(iso: string): number {
  return Number(hourFormat.format(new Date(iso))) % 24;
}

export function aggregateDay(orders: ConfirmedOrder[], events: EventMemo[]): DayAggregate {
  const confirmed = orders.filter((order) => order.status === "confirmed");

  const salesTotal = confirmed.reduce((sum, order) => sum + order.total, 0);
  const counterCount = confirmed.filter((order) => order.channel === "counter").length;
  const phoneCount = confirmed.filter((order) => order.channel === "phone").length;

  // 品目別の数量（商品・セットごと、多い順）。表示名は伝票に保存済みのものを使う。
  const itemMap = new Map<string, number>();
  const optionMap = new Map<string, number>();
  const hourMap = new Map<number, number>();
  for (const order of confirmed) {
    hourMap.set(tokyoHour(order.confirmedAt), (hourMap.get(tokyoHour(order.confirmedAt)) ?? 0) + 1);
    for (const line of order.ticket.lines) {
      itemMap.set(line.name, (itemMap.get(line.name) ?? 0) + line.item.quantity);
      for (const optionId of line.item.optionIds) {
        optionMap.set(optionId, (optionMap.get(optionId) ?? 0) + line.item.quantity);
      }
    }
  }

  const itemQuantities = [...itemMap.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

  const topOptionIds = [...optionMap.entries()]
    .map(([optionId, count]) => ({ optionId, count }))
    .sort((a, b) => b.count - a.count || a.optionId.localeCompare(b.optionId))
    .slice(0, 3);

  const hourlyCounts = [...hourMap.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  const nonReflection = events.filter((event) => event.category !== "reflection");
  const eventsSorted = [...nonReflection].sort((a, b) => {
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1; // 要対応を先頭に
    return a.createdAt.localeCompare(b.createdAt);
  });
  const reflections = events
    .filter((event) => event.category === "reflection")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    salesTotal,
    orderCount: confirmed.length,
    counterCount,
    phoneCount,
    itemQuantities,
    topOptionIds,
    hourlyCounts,
    events: eventsSorted,
    reflections,
  };
}

const categoryLabel: Record<EventMemo["category"], string> = {
  equipment: "設備",
  customer: "客",
  staff: "スタッフ",
  other: "その他",
  reflection: "振り返り",
};

export function eventCategoryLabel(category: EventMemo["category"]): string {
  return categoryLabel[category];
}

const yen = (value: number) => "¥" + value.toLocaleString("ja-JP");

function monthDay(businessDate: string): string {
  const [, month, day] = businessDate.split("-");
  return Number(month) + "月" + Number(day) + "日";
}

// 日報本文を組み立てる。数値はコードのテンプレート、文章部分（trend / eventsSummary）だけLLM。
export function assembleReport(params: {
  storeName: string;
  businessDate: string;
  aggregate: DayAggregate;
  optionName: (id: string) => string;
  suggestions: OrderSuggestion[];
  prose: { trend: string; eventsSummary: string };
}): string {
  const { storeName, businessDate, aggregate: a, optionName, suggestions, prose } = params;

  const items = a.itemQuantities.map((item) => item.name + " " + item.quantity).join("、") || "なし";
  const options = a.topOptionIds.map((option) => optionName(option.optionId) + " " + option.count + "回").join("、");

  const lines: string[] = [];
  lines.push("件名：【日報】" + storeName + " " + monthDay(businessDate));
  lines.push("");
  lines.push("■ 本日の実績");
  lines.push("売上合計：" + yen(a.salesTotal) + "（注文 " + a.orderCount + "件／うち電話 " + a.phoneCount + "件）");
  lines.push("品目別：" + items);
  if (options) lines.push("よく出たカスタム：" + options);
  lines.push("");
  lines.push("■ 本日の傾向");
  lines.push(prose.trend.trim() || "（特記事項なし）");
  lines.push("");
  lines.push("■ 出来事・要対応");
  lines.push(prose.eventsSummary.trim() || (a.events.length === 0 ? "特記事項はありません。" : a.events.map((event) =>
    (event.needsAction ? "【要対応】" : "・") + event.text).join("\n")));
  lines.push("");
  lines.push("■ 店長の振り返り");
  lines.push(a.reflections.length > 0 ? a.reflections.map((reflection) => reflection.text).join("\n") : "（記録なし）");

  // 「明日の発注予定」は候補が空なら節ごと省略する。
  if (suggestions.length > 0) {
    lines.push("");
    lines.push("■ 明日の発注予定");
    for (const suggestion of suggestions) {
      lines.push("・" + suggestion.name + " " + suggestion.units + suggestion.unitLabel);
    }
  }

  return lines.join("\n");
}
