import { describe, expect, it } from "vitest";
import { aggregateDay } from "./report";
import type { ConfirmedOrder, EventMemo, Ticket } from "./types";

function ticket(lines: { name: string; quantity: number; optionIds?: string[] }[]): Ticket {
  return {
    order: { items: [], customerName: null, pickupTime: null, pickupDate: null, unparsed: [] },
    lines: lines.map((line) => ({
      item: { raw: "", menuId: null, quantity: line.quantity, size: null, temperature: null, drinkId: null, optionIds: line.optionIds ?? [], candidateIds: [], uncertain: false },
      name: line.name,
      imageId: null,
      details: [],
      amount: 0,
      issues: [],
    })),
    total: 0,
  };
}

function order(overrides: Partial<ConfirmedOrder> & { id: string }): ConfirmedOrder {
  return {
    businessDate: "2026-11-23",
    confirmedAt: "2026-11-23T04:00:00.000Z", // JST 13:00
    channel: "counter",
    ticket: ticket([]),
    total: 0,
    status: "confirmed",
    createdBy: "demo",
    ...overrides,
  };
}

function memo(overrides: Partial<EventMemo> & { id: string }): EventMemo {
  return {
    businessDate: "2026-11-23",
    createdAt: "2026-11-23T05:00:00.000Z",
    text: "メモ",
    category: "other",
    needsAction: false,
    createdBy: "demo",
    ...overrides,
  };
}

describe("aggregateDay", () => {
  it("取り消し済みは売上・件数から除外する", () => {
    const orders = [
      order({ id: "1", total: 1000 }),
      order({ id: "2", total: 500, status: "cancelled" }),
    ];
    const result = aggregateDay(orders, []);
    expect(result.salesTotal).toBe(1000);
    expect(result.orderCount).toBe(1);
  });

  it("対面・電話の内訳を数える", () => {
    const orders = [
      order({ id: "1", channel: "counter", total: 100 }),
      order({ id: "2", channel: "phone", total: 200 }),
      order({ id: "3", channel: "phone", total: 300 }),
    ];
    const result = aggregateDay(orders, []);
    expect(result.counterCount).toBe(1);
    expect(result.phoneCount).toBe(2);
    expect(result.salesTotal).toBe(600);
  });

  it("オプションは数量重みで集計し上位3件を返す", () => {
    const orders = [
      order({ id: "1", total: 100, ticket: ticket([{ name: "ラテ", quantity: 2, optionIds: ["oat_milk"] }]) }),
      order({ id: "2", total: 100, ticket: ticket([{ name: "ラテ", quantity: 1, optionIds: ["oat_milk", "extra_shot"] }]) }),
      order({ id: "3", total: 100, ticket: ticket([{ name: "ラテ", quantity: 1, optionIds: ["soy_milk", "vanilla_syrup", "less_ice"] }]) }),
    ];
    const result = aggregateDay(orders, []);
    expect(result.topOptionIds.length).toBe(3);
    expect(result.topOptionIds[0]).toEqual({ optionId: "oat_milk", count: 3 });
    expect(result.itemQuantities[0]).toEqual({ name: "ラテ", quantity: 4 });
  });

  it("出来事は要対応を先頭に、振り返りは時刻順に分ける", () => {
    const events = [
      memo({ id: "r1", category: "reflection", text: "振り返り1", createdAt: "2026-11-23T10:00:00.000Z" }),
      memo({ id: "e1", category: "equipment", text: "設備1", needsAction: false, createdAt: "2026-11-23T06:00:00.000Z" }),
      memo({ id: "e2", category: "customer", text: "要対応", needsAction: true, createdAt: "2026-11-23T07:00:00.000Z" }),
      memo({ id: "r2", category: "reflection", text: "振り返り2", createdAt: "2026-11-23T11:00:00.000Z" }),
    ];
    const result = aggregateDay([], events);
    expect(result.events.map((event) => event.id)).toEqual(["e2", "e1"]);
    expect(result.reflections.map((reflection) => reflection.id)).toEqual(["r1", "r2"]);
  });
});
