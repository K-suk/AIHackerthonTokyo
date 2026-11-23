import assert from "node:assert/strict";
import { test } from "vitest";
import { applyVoiceCancellations, buildTicket, emptyOrder, orderItem } from "./order";

const soyLatte = orderItem({ menuId: "iced_latte", optionIds: ["soy_milk"] });
const oatLatte = orderItem({ menuId: "iced_latte", optionIds: ["oat_milk"] });
const ticket = buildTicket({ ...emptyOrder, items: [oatLatte, soyLatte] });

test("a cancelled latte is identified by its milk when the model returns both lines", () => {
  for (const [target, remaining] of [
    ["アイスラテの豆乳の方", oatLatte],
    ["ソイのアイスラテ", oatLatte],
    ["アイスラテのオーツミルク", soyLatte],
  ] as const) {
    const result = applyVoiceCancellations(ticket, [{ target, lineNumbers: [1, 2] }]);
    assert.deepEqual(result.items, [remaining], target);
    assert.equal(result.removedCount, 1);
    assert.deepEqual(result.choices, []);
  }
});

test("a cancellation without a milk preference still asks which latte", () => {
  const result = applyVoiceCancellations(ticket, [{ target: "アイスラテ", lineNumbers: [1, 2] }]);
  assert.deepEqual(result.items, [oatLatte, soyLatte]);
  assert.deepEqual(result.choices[0].candidates, ticket.lines);
});

test("a model-supplied line with the wrong milk is never removed", () => {
  const result = applyVoiceCancellations(ticket, [{ target: "アイスラテの豆乳", lineNumbers: [1] }]);
  assert.deepEqual(result.items, [oatLatte, soyLatte]);
  assert.deepEqual(result.choices[0].candidates, []);
});

test("matching milk on multiple lines still requires a choice", () => {
  const largeSoyLatte = { ...soyLatte, size: "G" } as const;
  const largerTicket = buildTicket({ ...emptyOrder, items: [oatLatte, soyLatte, largeSoyLatte] });
  const result = applyVoiceCancellations(largerTicket, [{ target: "アイスラテの豆乳", lineNumbers: [1, 2, 3] }]);
  assert.equal(result.removedCount, 0);
  assert.deepEqual(result.choices[0].candidates, largerTicket.lines.slice(1));
});
