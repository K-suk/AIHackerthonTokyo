import { expect, it } from "vitest";
import { menuSaveSchema, nameErrors, priceChanges } from "./menu-admin";
import { buildTicket, emptyOrder, orderItem } from "./order";
import { menu } from "./menu";
import { preferNamedProduct } from "./interpret";

it("商品名と別名の重複を全半角や空白の違いを含めて検出する", () => {
  const existing = [{ name: "抹茶ラテ", aliases: ["抹茶 ドリンク", "MATCHA"] }];
  expect(nameErrors({ name: "抹茶ドリンク", aliases: ["ｍａｔｃｈａ"] }, existing)).toMatchObject({
    name: expect.stringContaining("抹茶ラテ"), aliases: expect.stringContaining("抹茶ラテ"),
  });
});

it("整数価格を検証し、変更点に対象サイズを含める", () => {
  const data = { id: null, version: 1, kind: "product", entry: {
    name: "ゆず茶", category: "tea", aliases: [], price: 500.5, optionGroupIds: [],
  } };
  expect(menuSaveSchema.safeParse(data).success).toBe(false);
  expect(priceChanges({ price: 500, sizePrices: { T: 500 } }, { price: 550, sizePrices: { T: 550 } }))
    .toEqual([{ label: "価格", before: 500, after: 550 }, { label: "T", before: 500, after: 550 }]);
});

it("販売終了と品切れの伝票行を確定できず、注文できる候補を出す", () => {
  const catalog = structuredClone(menu);
  catalog.products.find(({ id }) => id === "hot_latte")!.discontinued = true;
  catalog.products.find(({ id }) => id === "cold_brew")!.soldOut = true;
  const ticket = buildTicket({
    ...emptyOrder, items: [orderItem({ menuId: "hot_latte" }), orderItem({ menuId: "cold_brew" })],
  }, catalog);
  expect(ticket.total).toBeNull();
  expect(ticket.lines.map((line) => line.issues[0].message)).toEqual(["販売終了した商品です", "品切れです"]);
  expect(ticket.lines.every((line) => line.issues[0].choices.length > 0)).toBe(true);
  expect(ticket.lines.flatMap((line) => line.issues[0].choices.map(({ patch }) => patch.menuId))).not.toContain("hot_latte");
});

it("温度のない商品名を選び、販売終了時は温度違いに自動で置き換えない", () => {
  const catalog = structuredClone(menu);
  const entry = { id: "matcha_latte", name: "抹茶ラテ", aliases: [], category: "tea", price: 550, optionGroupIds: [] };
  catalog.products.push(entry);
  const inferred = orderItem({ menuId: "hot_matcha_latte", temperature: "hot", size: "T" });
  const text = "抹茶のラテ、トールでお願いします。";
  expect(preferNamedProduct([inferred], text, catalog)[0]).toMatchObject({ menuId: entry.id, temperature: null });
  expect(preferNamedProduct([inferred], "ホットの抹茶ラテをお願いします", catalog)).toEqual([inferred]);
  catalog.products[catalog.products.length - 1].discontinued = true;
  const items = preferNamedProduct([inferred], text, catalog);
  const ticket = buildTicket({ ...emptyOrder, items }, catalog);
  expect(ticket.total).toBeNull();
  expect(ticket.lines[0].issues[0].choices.map(({ patch }) => patch.menuId)).toContain("hot_matcha_latte");
});
