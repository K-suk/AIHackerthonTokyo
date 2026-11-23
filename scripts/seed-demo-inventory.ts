import materials from "../data/seed/materials.json";
import recipes from "../data/seed/recipes.json";
import { lockCatalog, writeLockedCatalog } from "../lib/db/catalog";
import { getSql, withTransaction } from "../lib/db/client";
import type { Recipe, RecipeLine } from "../lib/types";

const productRecipes: Record<string, Recipe> = recipes.items;
const optionRecipes: Record<string, RecipeLine[]> = recipes.options;

async function seedDemoInventory() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL を指定してください。");
  const sql = getSql();
  try {
    const result = await withTransaction(async (tx) => {
      const catalog = await lockCatalog(tx);
      let materialsAdded = 0;
      for (const material of materials) {
        const inserted = await tx`
          insert into materials (id, name, unit, stock, reorder_point, order_unit, order_unit_label, updated_by)
          values (${material.id}, ${material.name}, ${material.unit}, ${material.stock}, ${material.reorderPoint}, ${material.orderUnit}, ${material.orderUnitLabel}, 'seed:demo-inventory')
          on conflict (id) do nothing returning id
        `;
        materialsAdded += inserted.length;
      }

      let recipesAdded = 0;
      for (const product of catalog.products) {
        const recipe = productRecipes[product.id];
        if (product.recipe === undefined && recipe) {
          product.recipe = recipe;
          recipesAdded++;
        }
      }
      for (const [id, option] of Object.entries(catalog.options)) {
        const recipeDelta = optionRecipes[id];
        if (option.recipeDelta === undefined && recipeDelta) {
          option.recipeDelta = recipeDelta;
          recipesAdded++;
        }
      }
      if (recipesAdded) await writeLockedCatalog(tx, catalog, "seed:demo-inventory");
      return { materialsAdded, recipesAdded };
    });
    console.log(JSON.stringify(result));
  } finally {
    await sql.end();
  }
}

seedDemoInventory().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "デモ在庫を登録できませんでした。");
  process.exitCode = 1;
});
