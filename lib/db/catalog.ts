import fixture from "../../fukusho-menu-mock.json";
import type { Catalog } from "../types";
import { getSql, isDbConfigured } from "./client";

// カタログ（メニュー）の読み書き。
// 注文1件の処理でDBを何度も読まないよう、メモリにキャッシュする。
// DB未設定または読み取り失敗のときだけ fukusho-menu-mock.json にフォールバックする
// （Supabase 準備後はDBを優先）。書き込み（saveCatalog）はDBに書けなければ必ずエラーにする。

const fallbackCatalog = fixture as unknown as Catalog;

let cache: { catalog: Catalog; version: number } | null = null;

// 取得元が変わったときだけログを出す（毎回のアクセスでログを出さない）。
let lastSource: "db" | "fixture" | null = null;
function noteSource(source: "db" | "fixture", reason?: string) {
  if (lastSource === source) return;
  lastSource = source;
  if (source === "db") console.info("[catalog] 取得元: db");
  else console.warn(`[catalog] 取得元: fixture（${reason}）`);
}

type DbResult =
  | { ok: true; catalog: Catalog; version: number }
  | { ok: false; reason: string };

async function readFromDb(): Promise<DbResult> {
  if (!isDbConfigured()) return { ok: false, reason: "DATABASE_URL 未設定" };
  try {
    const sql = getSql();
    const rows = await sql<{ json: Catalog; version: number }[]>`
      select json, version from catalog where id = 1
    `;
    if (rows.length === 0) return { ok: false, reason: "catalog 未投入（npm run seed）" };
    return { ok: true, catalog: rows[0].json, version: rows[0].version };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "DB読み取り失敗" };
  }
}

// メモリキャッシュ付き。2回目以降はDBを読まない。
export async function getCatalog(): Promise<Catalog> {
  if (cache) return cache.catalog;
  const result = await readFromDb();
  if (result.ok) {
    noteSource("db");
    cache = { catalog: result.catalog, version: result.version };
    return cache.catalog;
  }
  // DBに無い／読めない場合のみフィクスチャ。キャッシュはしない
  // （シード後の初回アクセスで拾えるようにするため）。
  noteSource("fixture", result.reason);
  return fallbackCatalog;
}

// 新しい version を返し、キャッシュを破棄する。DBに書けなければエラーにする。
export async function saveCatalog(catalog: Catalog, updatedBy: string): Promise<number> {
  const sql = getSql(); // DATABASE_URL 未設定なら throw
  const [row] = await sql<{ version: number }[]>`
    insert into catalog (id, json, version, updated_by)
    values (1, ${sql.json(catalog as unknown as Parameters<typeof sql.json>[0])}, 1, ${updatedBy})
    on conflict (id) do update
      set json = excluded.json,
          version = catalog.version + 1,
          updated_at = now(),
          updated_by = excluded.updated_by
    returning version
  `;
  cache = { catalog, version: row.version };
  lastSource = "db";
  return row.version;
}

// テスト・シードから使う内部用（キャッシュ破棄）。
export function clearCatalogCache(): void {
  cache = null;
  lastSource = null;
}
