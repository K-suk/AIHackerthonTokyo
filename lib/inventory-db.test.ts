import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toBusinessDate } from "./business-date";
import { getCatalog } from "./db/catalog";
import { getSql, withTransaction } from "./db/client";
import { applyConsumption, getStockSnapshot, revertConsumption, suggestOrders } from "./db/materials";
import { computeConsumption } from "./inventory";
import { applyInventoryCommands, undoInventoryChange } from "./inventory-voice";
import { buildTicket, emptyOrder, orderItem } from "./order";

const database = process.env.INVENTORY_TEST_DATABASE_URL;

describe.skipIf(!database)("在庫のPostgres統合", () => {
  beforeAll(() => {
    const url = new URL(database!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/koe_inventory_test") {
      throw new Error("専用ローカルDB koe_inventory_test を指定してください。");
    }
    process.env.DATABASE_URL = database;
  });

  afterAll(async () => {
    if (process.env.DATABASE_URL === database) await getSql().end();
  });

  it("発注単位を換算し、品切れを同時に更新して、未知の指示を変更せずに両方を戻す", async () => {
    const before = await getStockSnapshot();
    const previous = Boolean((await getCatalog()).products.find(({ id }) => id === "cheesecake")?.soldOut);
    const commands = [
      { kind: "setStock", materialId: "milk", qty: 4, unit: "orderUnit" },
      { kind: "setSoldOut", menuId: "cheesecake", soldOut: !previous },
      { kind: "unknown", text: "わからない指示" },
    ] as const;
    const result = await applyInventoryCommands([...commands], "在庫テスト");
    expect(result.changeId).not.toBe("");
    expect(result.summary).toContain("牛乳の在庫を4本（4,000ml）に更新しました");
    expect(result.summary.join()).toContain("わからない指示");
    expect((await getStockSnapshot()).milk).toBe(4000);
    expect(Boolean((await getCatalog()).products.find(({ id }) => id === "cheesecake")?.soldOut)).toBe(!previous);
    await undoInventoryChange(result.changeId, "在庫テスト");
    expect(await getStockSnapshot()).toEqual(before);
    expect(Boolean((await getCatalog()).products.find(({ id }) => id === "cheesecake")?.soldOut)).toBe(previous);
    await expect(undoInventoryChange(result.changeId, "在庫テスト")).rejects.toThrow();
  });

  it("注文の減算と取消をそれぞれ一度だけ行い、マイナス在庫と発注候補を表示できる", async () => {
    const before = await getStockSnapshot();
    const businessDate = toBusinessDate(new Date());
    const catalog = await getCatalog();
    const order = { ...emptyOrder, items: [orderItem({ menuId: "iced_latte", size: "T", quantity: 11, optionIds: ["oat_milk"] })] };
    const ticket = buildTicket(order, catalog);
    const consumption = computeConsumption(ticket, catalog);
    const sql = getSql();
    const [confirmed] = await sql<{ id: string }[]>`
      insert into orders (business_date, channel, ticket, total, catalog_version, created_by)
      values (${businessDate}, 'counter', ${sql.json({})}, ${ticket.total}, 1, '在庫テスト') returning id
    `;
    await withTransaction(async (tx) => {
      await applyConsumption(tx, confirmed.id, consumption, "在庫テスト");
      await applyConsumption(tx, confirmed.id, consumption, "在庫テスト");
    });
    expect(await getStockSnapshot()).toMatchObject({ milk: before.milk, oat_milk: before.oat_milk - 2200 });
    expect(await suggestOrders(businessDate)).toEqual(expect.arrayContaining([
      expect.objectContaining({ materialId: "oat_milk", todayUsage: 2200 }),
    ]));
    await withTransaction(async (tx) => {
      await revertConsumption(tx, confirmed.id, "在庫テスト");
      await revertConsumption(tx, confirmed.id, "在庫テスト");
    });
    expect(await getStockSnapshot()).toEqual(before);
  });
});
