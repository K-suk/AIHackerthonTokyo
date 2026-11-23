import postgres from "postgres";

// Supabase（Postgres）へサーバ側から直接接続する。
// 接続文字列は DATABASE_URL（サーバ専用。NEXT_PUBLIC_ を付けない）。
// 接続プーラーのトランザクションモード（6543）を使う場合は prepare:false が必要。

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

// 開発時のホットリロードで接続が増えないよう globalThis に保持する。
const globalForDb = globalThis as unknown as { __koeSql?: Sql };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が未設定です。Supabase の接続文字列を .env に設定してください。");
  }
  if (!globalForDb.__koeSql) {
    globalForDb.__koeSql = postgres(url, {
      prepare: false, // 接続プーラーのトランザクションモードに対応
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.__koeSql;
}

// 注文の保存と在庫の減算を1つのトランザクションにまとめるために使う。
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = getSql();
  return sql.begin((tx) => fn(tx as Tx)) as Promise<T>;
}
