import type { ConfirmedOrder, Ticket } from "../types";
import { getSql, type Tx } from "./client";

// 注文（確定済み）のDBアクセス。Route Handler からはこのリポジトリ関数を経由する。

type OrderRow = {
  id: string;
  business_date: string;
  confirmed_at: Date;
  channel: "counter" | "phone";
  ticket: Ticket;
  total: number;
  status: "confirmed" | "cancelled";
  created_by: string;
};

function toConfirmedOrder(row: OrderRow): ConfirmedOrder {
  return {
    id: row.id,
    businessDate: row.business_date,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    channel: row.channel,
    ticket: row.ticket,
    total: row.total,
    status: row.status,
    createdBy: row.created_by,
  };
}

// 確定時の catalog_version を記録するために、現在のカタログ版を取る。
export async function getCatalogVersion(tx: Tx): Promise<number> {
  const rows = await tx<{ version: number }[]>`select version from catalog where id = 1`;
  return rows[0]?.version ?? 0;
}

// 注文を1件保存する。idempotency_key が既にあれば二重確定とみなし、既存IDを返す。
export async function insertOrder(
  tx: Tx,
  params: {
    businessDate: string;
    channel: "counter" | "phone";
    ticket: Ticket;
    total: number;
    catalogVersion: number;
    idempotencyKey: string;
    createdBy: string;
  },
): Promise<{ id: string; alreadyExisted: boolean }> {
  const ticketJson = params.ticket as unknown as Parameters<typeof tx.json>[0];
  const inserted = await tx<{ id: string }[]>`
    insert into orders (business_date, channel, ticket, total, catalog_version, idempotency_key, created_by)
    values (
      ${params.businessDate}, ${params.channel}, ${tx.json(ticketJson)}, ${params.total},
      ${params.catalogVersion}, ${params.idempotencyKey}, ${params.createdBy}
    )
    on conflict (idempotency_key) do nothing
    returning id
  `;
  if (inserted.length > 0) return { id: inserted[0].id, alreadyExisted: false };

  const [existing] = await tx<{ id: string }[]>`
    select id from orders where idempotency_key = ${params.idempotencyKey}
  `;
  return { id: existing.id, alreadyExisted: true };
}

// 注文を取り消す（物理削除しない）。confirmed のときだけ cancelled に更新する。
// 取り消せた場合に true を返す（既に取り消し済み・存在しない場合は false）。
export async function cancelOrder(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    update orders set status = 'cancelled'
    where id = ${id} and status = 'confirmed'
    returning id
  `;
  return rows.length > 0;
}

// 指定営業日の注文を新しい順で返す（取り消し済みも含む。表示側で区別する）。
export async function listOrdersByDate(businessDate: string): Promise<ConfirmedOrder[]> {
  const sql = getSql();
  const rows = await sql<OrderRow[]>`
    select id, business_date::text as business_date, confirmed_at, channel, ticket, total, status, created_by
    from orders
    where business_date = ${businessDate}
    order by confirmed_at desc
  `;
  return rows.map(toConfirmedOrder);
}
