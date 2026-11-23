import type { ConfirmedOrder } from "./types";

export function summarizeOrders(orders: ConfirmedOrder[]) {
  let sales = 0;
  let count = 0;
  let cancelled = 0;
  const products = new Map<string, { id: string; name: string; quantity: number }>();

  for (const order of orders) {
    if (order.status === "cancelled") {
      cancelled++;
      continue;
    }
    count++;
    sales += order.total;
    for (const line of order.ticket.lines ?? []) {
      const id = line.item.menuId ?? line.name;
      const previous = products.get(id);
      products.set(id, { id, name: line.name, quantity: (previous?.quantity ?? 0) + line.item.quantity });
    }
  }

  return { sales, count, cancelled, products: [...products.values()].sort((a, b) =>
    b.quantity - a.quantity || a.name.localeCompare(b.name, "ja"),
  ) };
}
