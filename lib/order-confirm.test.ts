import { describe, expect, it } from "vitest";
import { buildTicket, confirmBlockReason, emptyOrder, orderItem } from "./order";

describe("confirmBlockReason", () => {
  it("空の注文は確定不可", () => {
    expect(confirmBlockReason(buildTicket(emptyOrder))).toBe("注文がありません");
  });

  it("確定可能な注文は null", () => {
    const ticket = buildTicket({ ...emptyOrder, items: [orderItem({ menuId: "cheesecake" })] });
    expect(ticket.total).not.toBeNull();
    expect(confirmBlockReason(ticket)).toBeNull();
  });

  it("警告が残る注文（ミルク重複）は確定不可", () => {
    const ticket = buildTicket({
      ...emptyOrder,
      items: [orderItem({ menuId: "iced_latte", optionIds: ["soy_milk", "oat_milk"] })],
    });
    expect(confirmBlockReason(ticket)).toBe("警告を解消すると確定できます");
  });

  it("unparsed が残る注文は確定不可", () => {
    const ticket = buildTicket({
      ...emptyOrder,
      items: [orderItem({ menuId: "cheesecake" })],
      unparsed: ["謎のトッピング"],
    });
    expect(confirmBlockReason(ticket)).toBe("確認できなかった内容を直すと確定できます");
  });
});
