import type { EventCategory, EventMemo } from "../types";
import { getSql } from "./client";

// 出来事メモ（出来事・店長の振り返り）のDBアクセス。

type EventRow = {
  id: string;
  business_date: string;
  created_at: Date;
  text: string;
  category: EventCategory;
  needs_action: boolean;
  created_by: string;
};

function toEventMemo(row: EventRow): EventMemo {
  return {
    id: row.id,
    businessDate: row.business_date,
    createdAt: new Date(row.created_at).toISOString(),
    text: row.text,
    category: row.category,
    needsAction: row.needs_action,
    createdBy: row.created_by,
  };
}

export async function insertEvent(params: {
  businessDate: string;
  text: string;
  category: EventCategory;
  needsAction: boolean;
  createdBy: string;
}): Promise<EventMemo> {
  const sql = getSql();
  const [row] = await sql<EventRow[]>`
    insert into events (business_date, text, category, needs_action, created_by)
    values (${params.businessDate}, ${params.text}, ${params.category}, ${params.needsAction}, ${params.createdBy})
    returning id, business_date::text as business_date, created_at, text, category, needs_action, created_by
  `;
  return toEventMemo(row);
}

export async function listEventsByDate(businessDate: string): Promise<EventMemo[]> {
  const sql = getSql();
  const rows = await sql<EventRow[]>`
    select id, business_date::text as business_date, created_at, text, category, needs_action, created_by
    from events
    where business_date = ${businessDate}
    order by created_at asc
  `;
  return rows.map(toEventMemo);
}

export async function updateEvent(
  id: string,
  patch: { text?: string; category?: EventCategory; needsAction?: boolean },
): Promise<EventMemo | null> {
  const sql = getSql();
  const rows = await sql<EventRow[]>`
    update events set
      text = coalesce(${patch.text ?? null}, text),
      category = coalesce(${patch.category ?? null}, category),
      needs_action = coalesce(${patch.needsAction ?? null}, needs_action)
    where id = ${id}
    returning id, business_date::text as business_date, created_at, text, category, needs_action, created_by
  `;
  return rows[0] ? toEventMemo(rows[0]) : null;
}

export async function deleteEvent(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`delete from events where id = ${id} returning id`;
  return rows.length > 0;
}
