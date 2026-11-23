import { groupsFor, menu, optionById, productById, setById } from "./menu";
import type { Size, Temperature } from "./menu";

export type ParsedItem = {
  raw: string;
  menuId: string | null;
  quantity: number;
  size: Size | null;
  temperature: Temperature | null;
  drinkId: string | null;
  optionIds: string[];
  candidateIds: string[];
  uncertain: boolean;
};

export type ParsedOrder = {
  items: ParsedItem[];
  pickupRequested?: boolean;
  customerName: string | null;
  pickupTime: string | null;
  pickupDate: string | null;
  unparsed: string[];
};

export type Correction = { label: string; patch: Partial<ParsedItem> };
export type Issue = { message: string; choices: Correction[]; uncertain?: boolean };
export type TicketLine = {
  item: ParsedItem;
  name: string;
  imageId: string | null;
  details: string[];
  amount: number | null;
  issues: Issue[];
};

export type Ticket = {
  order: ParsedOrder;
  lines: TicketLine[];
  total: number | null;
};

export type VoiceCancellation = { target: string; lineNumbers: number[] };

export type CancellationChoice = { target: string; candidates: TicketLine[] };

export function applyVoiceCancellations(ticket: Ticket, cancellations: VoiceCancellation[]) {
  const removed = new Set<TicketLine>();
  const choices: CancellationChoice[] = [];
  for (const { target, lineNumbers } of cancellations) {
    const requested = [...new Set(lineNumbers)];
    const candidates = requested
      .filter((number) => Number.isSafeInteger(number) && number > 0 && number <= ticket.lines.length)
      .map((number) => ticket.lines[number - 1]);
    if (requested.length === 1 && candidates.length === 1) removed.add(candidates[0]);
    else choices.push({ target, candidates });
  }
  return {
    items: ticket.lines.filter((line) => !removed.has(line)).map((line) => line.item),
    choices: choices.map(({ target, candidates }) => ({ target, candidates: candidates.filter((line) => !removed.has(line)) })),
    removedCount: removed.size,
  };
}

export const emptyOrder: ParsedOrder = {
  items: [],
  pickupRequested: false,
  customerName: null,
  pickupTime: null,
  pickupDate: null,
  unparsed: [],
};

export function hasPickup(order: ParsedOrder) {
  return Boolean(order.pickupRequested || order.customerName || order.pickupTime || order.pickupDate);
}

export function orderItem(overrides: Partial<ParsedItem>): ParsedItem {
  return {
    raw: "",
    menuId: null,
    quantity: 1,
    size: null,
    temperature: null,
    drinkId: null,
    optionIds: [],
    candidateIds: [],
    uncertain: false,
    ...overrides,
  };
}

function menuChoices(ids: string[]): Correction[] {
  return [...new Set(ids)].slice(0, 3).flatMap((id) => {
    const item = productById(id) ?? setById(id);
    return item ? [{ label: item.name, patch: { menuId: id, uncertain: false } }] : [];
  });
}

function temperatureAlternatives(item: ParsedItem, target: ReturnType<typeof productById>): Correction[] {
  const alternatives = menu.products.filter((product) =>
    product.temperature === item.temperature &&
    product.category === target?.category &&
    product.name.replace(/^(アイス|ホット)/, "") === target.name.replace(/^(アイス|ホット)/, "")
  );
  return alternatives.map((product) => ({
    label: product.name,
    patch: setById(item.menuId) ? { drinkId: product.id } : { menuId: product.id },
  }));
}

function validateLine(item: ParsedItem): TicketLine {
  const product = productById(item.menuId);
  const set = setById(item.menuId);
  const menuItem = product ?? set;
  const issues: Issue[] = [];
  const details = set ? [set.includedItems.join("・")] : [];

  if (!menuItem) {
    issues.push({ message: "該当する商品を確認してください", choices: menuChoices(item.candidateIds) });
    return { item, name: item.raw || "未特定の商品", imageId: null, details, amount: null, issues };
  }

  if (item.uncertain) {
    issues.push({
      message: "商品が合っているか確認してください",
      choices: menuChoices([menuItem.id, ...item.candidateIds]),
      uncertain: true,
    });
  }

  const drinkChoice = set?.drinkChoices.find((choice) => choice.productId === item.drinkId);
  const drink = drinkChoice && productById(drinkChoice.productId);
  if (set && !drink) {
    issues.push({
      message: "セットドリンクを選んでください",
      choices: set.drinkChoices.flatMap((choice) => {
        const candidate = productById(choice.productId);
        return candidate ? [{ label: candidate.name, patch: { drinkId: candidate.id } }] : [];
      }),
    });
  }

  const target = product ?? drink;
  if (target && item.temperature && item.temperature !== target.temperature) {
    issues.push({
      message: "この温度は選べません",
      choices: [
        ...temperatureAlternatives(item, target),
        { label: target.temperature === "hot" ? "ホットのまま" : target.temperature === "ice" ? "アイスのまま" : "指定なし", patch: { temperature: null } },
      ],
    });
  }

  const size = item.size ?? target?.defaultSize;
  const sizePrice = size && target?.sizePrices?.[size];
  const defaultPrice = target && (target.sizePrices?.[target.defaultSize ?? "T"] ?? target.price);
  const sizeDiff = typeof sizePrice === "number" && typeof defaultPrice === "number" ? sizePrice - defaultPrice : 0;
  if (target && item.size && typeof sizePrice !== "number") {
    issues.push({
      message: "このサイズは選べません",
      choices: [{ label: "標準サイズ", patch: { size: null } }],
    });
  }
  if (drink) details.push("セットドリンク：" + drink.name);
  if (item.size && typeof sizePrice === "number") details.push("サイズ " + item.size);

  let optionsTotal = 0;
  const uniqueOptionIds = [...new Set(item.optionIds)];
  const groups = groupsFor(target);
  if (target) {
    for (const group of groups) {
      const selected = uniqueOptionIds.filter((id) => group.optionIds.includes(id));
      if (selected.length > group.maxSelections) {
        issues.push({
          message: group.name + "の組み合わせを確認してください",
          choices: selected.flatMap((id) => {
            const option = optionById(id);
            return option ? [{
              label: option.name,
              patch: { optionIds: uniqueOptionIds.filter((current) => current === id || !group.optionIds.includes(current)) },
            }] : [];
          }),
        });
      }
      const required = group.requiresOptionId;
      if (selected.length > 0 && required && !uniqueOptionIds.includes(required)) {
        issues.push({
          message: "甘さの指定にはシロップの選択が必要です",
          choices: [
            { label: "シロップを追加", patch: { optionIds: [...uniqueOptionIds, required] } },
            { label: "甘さの指定を外す", patch: { optionIds: uniqueOptionIds.filter((id) => !group.optionIds.includes(id)) } },
          ],
        });
      }
    }

    const unsupported = uniqueOptionIds.filter((id) => !groups.some((group) => group.optionIds.includes(id)));
    if (unsupported.length > 0) {
      issues.push({
        message: "この商品では " + unsupported.map((id) => optionById(id)?.name ?? id).join("・") + " を選べません",
        choices: [{ label: "選べない指定を外す", patch: { optionIds: uniqueOptionIds.filter((id) => !unsupported.includes(id)) } }],
      });
    }
  }
  for (const id of uniqueOptionIds) {
    const option = optionById(id);
    if (!option || !groups.some((group) => group.optionIds.includes(id))) continue;
    details.push(option.name + (option.priceDiff > 0 ? " ＋¥" + option.priceDiff : ""));
    optionsTotal += option.priceDiff;
  }

  return {
    item,
    name: menuItem.name,
    imageId: menuItem.id,
    details,
    amount: issues.length ? null : (menuItem.price + (drinkChoice?.priceDiff ?? 0) + sizeDiff + optionsTotal) * item.quantity,
    issues,
  };
}

export function buildTicket(order: ParsedOrder): Ticket {
  const lines = order.items.map(validateLine);
  return {
    order,
    lines,
    total: lines.length > 0 && !order.unparsed.length && lines.every((line) => line.amount !== null)
      ? lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
      : null,
  };
}

export const demos = [
  {
    id: "lunch",
    label: "サンプル注文",
    text: "ランチセット、ドリンクはアイスラテをオーツに変更で。チーズケーキも1つですね。",
    order: {
      ...emptyOrder,
      items: [
        orderItem({ menuId: "lunch_set", drinkId: "iced_latte", optionIds: ["oat_milk"] }),
        orderItem({ menuId: "cheesecake" }),
      ],
    },
  },
  {
    id: "conflict",
    label: "警告例",
    text: "アイスラテを、豆乳とオーツ両方でお願いします。",
    order: { ...emptyOrder, items: [orderItem({ menuId: "iced_latte", optionIds: ["soy_milk", "oat_milk"] })] },
  },
  {
    id: "phone",
    label: "受取サンプル",
    text: "佐藤さま、15時のお受け取りで、アイスラテのトールをオーツミルクで2つですね。",
    order: {
      ...emptyOrder,
      pickupRequested: true,
      customerName: "佐藤さま",
      pickupTime: "15:00",
      items: [orderItem({ menuId: "iced_latte", size: "T", temperature: "ice", quantity: 2, optionIds: ["oat_milk"] })],
    },
  },
] satisfies { id: string; label: string; text: string; order: ParsedOrder }[];
