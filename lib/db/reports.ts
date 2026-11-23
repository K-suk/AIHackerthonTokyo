import { getSql } from "./client";

// 日報本文（最終版）の保存と読み出し。営業日ごとに1件。

export async function getReport(businessDate: string): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<{ body: string }[]>`
    select body from reports where business_date = ${businessDate}
  `;
  return rows[0]?.body ?? null;
}

export async function saveReport(businessDate: string, body: string, updatedBy: string): Promise<void> {
  const sql = getSql();
  await sql`
    insert into reports (business_date, body, updated_by)
    values (${businessDate}, ${body}, ${updatedBy})
    on conflict (business_date) do update
      set body = excluded.body,
          generated_at = now(),
          updated_by = excluded.updated_by
  `;
}
