import { describe, expect, it } from "vitest";
import { orderSuggestions } from "./db/materials";
import type { MaterialUsage } from "./db/materials";
import { checkAvailability, computeConsumption } from "./inventory";
import { menu } from "./menu";
import { buildTicket, emptyOrder, orderItem } from "./order";
import type { ParsedItem } from "./types";
import { catalogSchema } from "./catalog-schema";

const ticketFor = (...items: Partial<ParsedItem>[]) => buildTicket({ ...emptyOrder, items: items.map(orderItem) });

describe("材料の使用量", () => {
  it("数量、サイズ、ミルク変更とショット追加を反映する", () => {
    const ticket = ticketFor({ menuId: "iced_latte", size: "T", quantity: 2, optionIds: ["oat_milk", "extra_shot"] },
      { menuId: "hot_latte", size: "G" });
    expect(Object.fromEntries(computeConsumption(ticket, menu))).toEqual({ milk: 260, oat_milk: 400, espresso_beans: 81 });
  });

  it("セットのドリンクとフードを合算し、レシピのない商品を飛ばす", () => {
    const ticket = ticketFor({ menuId: "lunch_set", drinkId: "iced_latte", optionIds: ["oat_milk"] },
      { menuId: "cake_set", drinkId: "cold_brew" }, { menuId: "carbonara" });
    expect(Object.fromEntries(computeConsumption(ticket, menu))).toEqual({
      sandwich: 1, mini_salad: 1, oat_milk: 200, espresso_beans: 18, cold_brew: 160, cheesecake: 1,
    });
  });

  it("DBのレシピとオプション差分を優先する", () => {
    const catalog = structuredClone(menu);
    catalog.products.find(({ id }) => id === "iced_latte")!.recipe = { T: [{ materialId: "milk", qty: 150 }] };
    catalog.options.oat_milk.recipeDelta = [{ materialId: "milk", qty: -150 }, { materialId: "oat_milk", qty: 150 }];
    expect(Object.fromEntries(computeConsumption(ticketFor({ menuId: "iced_latte", optionIds: ["oat_milk"] }), catalog)))
      .toEqual({ oat_milk: 150 });
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
  });
});

describe("在庫の注意", () => {
  it("セットのフードの品切れを検出し、販売終了した候補を除く", () => {
    const catalog = structuredClone(menu);
    catalog.products.find(({ id }) => id === "cheesecake")!.soldOut = true;
    catalog.products.find(({ id }) => id === "croissant")!.discontinued = true;
    const notices = checkAvailability(ticketFor({ menuId: "cake_set", drinkId: "iced_latte" }), catalog,
      { cheesecake: 10, milk: 500, espresso_beans: 100 });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "soldOut", menuId: "cheesecake" });
    expect(notices[0].alternatives).not.toContain("croissant");
  });

  it("オーツ不足と在庫の足りる豆乳を区別する", () => {
    const ticket = ticketFor({ menuId: "iced_latte", optionIds: ["oat_milk"] });
    expect(checkAvailability(ticket, menu, { oat_milk: 10, soy_milk: 400, espresso_beans: 100 }))
      .toEqual([{ kind: "lowStock", materialId: "oat_milk", alternatives: ["soy_milk"] }]);
    expect(checkAvailability(ticket, menu, { oat_milk: 10, soy_milk: 10, espresso_beans: 100 })[0].alternatives).toEqual([]);
  });
});

it("発注候補は不要時に出さず、端数とマイナス在庫を切り上げる", () => {
  const material: MaterialUsage = { id: "milk", name: "牛乳", unit: "ml", stock: 2500, todayUsage: 500,
    reorderPoint: 2000, orderUnit: 1000, orderUnitLabel: "本" };
  expect(orderSuggestions([material])).toEqual([]);
  expect(orderSuggestions([{ ...material, stock: 400 }])[0].units).toBe(3);
  expect(orderSuggestions([{ ...material, stock: -500 }])[0].units).toBe(3);
});
