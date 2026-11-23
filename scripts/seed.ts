import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSql, withTransaction } from "../lib/db/client";
import fixture from "../fukusho-menu-mock.json";
import type { Catalog, Material } from "../lib/types";

// 初期データ投入。何度実行しても重複しないよう ON CONFLICT DO NOTHING で冪等にする。
// カタログは fukusho-menu-mock.json。材料・レシピは data/seed/ があれば読み込む（友達が後で用意）。

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    try {
      process.loadEnvFile(resolve(process.cwd(), file));
    } catch {
      // ファイルが無ければ飛ばす。
    }
  }
}

function readJsonIfExists<T>(relativePath: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")) as T;
  } catch {
    return null;
  }
}

async function addMissingMenu(fixtureCatalog: Catalog) {
  return withTransaction(async (tx) => {
    const [row] = await tx<{ json: Catalog }[]>`
      select json from catalog where id = 1 for update
    `;
    if (!row) throw new Error("カタログが未投入です。先に npm run seed を実行してください。");

    const current = row.json;
    const existingIds = new Set([...current.products, ...current.sets].map(({ id }) => id));
    const products = fixtureCatalog.products.filter(({ id }) => !existingIds.has(id));
    const sets = fixtureCatalog.sets.filter(({ id }) => !existingIds.has(id));
    const added = products.length + sets.length;
    if (!added) return 0;

    const productIds = new Set([...current.products, ...products].map(({ id }) => id));
    if (products.some(({ optionGroupIds }) => optionGroupIds.some((id) => !Object.hasOwn(current.optionGroups, id))) ||
        sets.some(({ drinkChoices }) => drinkChoices.some(({ productId }) => !productIds.has(productId)))) {
      throw new Error("追加メニューに必要なオプショングループまたはセットドリンクがDBにありません。");
    }

    const merged = {
      ...current,
      products: [...current.products, ...products],
      sets: [...current.sets, ...sets],
    };
    await tx`
      update catalog
      set json = ${tx.json(merged as unknown as Parameters<typeof tx.json>[0])},
          version = version + 1,
          updated_at = now(),
          updated_by = 'seed:add-missing-menu'
      where id = 1
    `;
    return added;
  });
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL が未設定です。.env に Supabase の接続文字列を設定してください。");
    process.exit(1);
  }

  const sql = getSql();
  const catalog = fixture as unknown as Catalog;

  // レシピがあればカタログの商品に合成してから保存する。
  const recipes = readJsonIfExists<Record<string, Catalog["products"][number]["recipe"]>>("data/seed/recipes.json");
  if (recipes) {
    for (const product of catalog.products) {
      if (recipes[product.id]) product.recipe = recipes[product.id];
    }
  }

  if (process.argv.includes("--add-missing-menu")) {
    const added = await addMissingMenu(catalog);
    console.log(`既存カタログに ${added} 品追加しました。`);
    await sql.end();
    return;
  }

  await sql`
    insert into catalog (id, json, version, updated_by)
    values (1, ${sql.json(catalog as unknown as Parameters<typeof sql.json>[0])}, 1, 'seed')
    on conflict (id) do nothing
  `;
  console.log(`カタログを投入（商品 ${catalog.products.length} / セット ${catalog.sets.length}）`);

  const materials = readJsonIfExists<Material[]>("data/seed/materials.json");
  if (materials?.length) {
    for (const m of materials) {
      await sql`
        insert into materials (id, name, unit, stock, reorder_point, order_unit, order_unit_label, updated_by)
        values (${m.id}, ${m.name}, ${m.unit}, ${m.stock}, ${m.reorderPoint}, ${m.orderUnit}, ${m.orderUnitLabel}, 'seed')
        on conflict (id) do nothing
      `;
    }
    console.log(`材料を投入（${materials.length} 件）`);
  } else {
    console.log("材料データ（data/seed/materials.json）は未配置のためスキップ");
  }

  await sql.end();
  console.log("シード完了");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
