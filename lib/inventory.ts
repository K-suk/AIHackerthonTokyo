import recipeSeed from "../data/seed/recipes.json";
import materialSeed from "../data/seed/materials.json";
import { groupsFor, optionById, productById, setById } from "./menu";
import type { AvailabilityNotice, Catalog, ParsedItem, Product, Recipe, RecipeLine, Ticket } from "./types";

const demoRecipes: Record<string, Recipe> = recipeSeed.items;
const demoDeltas: Record<string, RecipeLine[]> = recipeSeed.options;
const materialNames = new Map(materialSeed.map(({ id, name }) => [name, id]));

function setComponents(item: ParsedItem, catalog: Catalog) {
  const set = setById(item.menuId, catalog);
  const food = set?.includedItems.map((id) => catalog.products.find((product) => product.id === id || product.name === id)) ?? [];
  const drink = set?.drinkChoices.some(({ productId }) => productId === item.drinkId)
    ? productById(item.drinkId, catalog)
    : undefined;
  return { set, food, drink };
}

function addRecipe(usage: Map<string, number>, recipe: RecipeLine[]) {
  for (const { materialId, qty } of recipe) {
    usage.set(materialId, (usage.get(materialId) ?? 0) + qty);
  }
}

function recipeFor(product: Product | undefined, size?: ParsedItem["size"]): RecipeLine[] {
  if (!product) return [];
  const recipe = product.recipe ?? demoRecipes[product.id];
  return recipe?.[size ?? product.defaultSize ?? "default"] ?? recipe?.default ?? [];
}

function lineConsumption(item: ParsedItem, catalog: Catalog) {
  const usage = new Map<string, number>();
  const { set, food, drink } = setComponents(item, catalog);
  const product = set ? drink : productById(item.menuId, catalog);
  if (set) {
    for (const [index, entry] of food.entries()) {
      if (entry) addRecipe(usage, recipeFor(entry));
      else {
        const materialId = materialNames.get(set.includedItems[index]);
        addRecipe(usage, demoRecipes[set.id]?.default?.filter((line) => line.materialId === materialId) ?? []);
      }
    }
  }
  const recipe = recipeFor(product, item.size);
  addRecipe(usage, recipe);
  if (recipe.length) {
    const optionIds = new Set(groupsFor(product, catalog).flatMap((group) => group?.optionIds ?? []));
    for (const id of new Set(item.optionIds)) {
      if (optionIds.has(id)) addRecipe(usage, optionById(id, catalog)?.recipeDelta ?? demoDeltas[id] ?? []);
    }
  }
  return usage;
}

export function computeConsumption(ticket: Ticket, catalog: Catalog): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of ticket.order.items) {
    for (const [id, qty] of lineConsumption(item, catalog)) {
      if (qty > 0) result.set(id, (result.get(id) ?? 0) + qty * item.quantity);
    }
  }
  return result;
}

export function checkAvailability(ticket: Ticket, catalog: Catalog, stock: Record<string, number>): AvailabilityNotice[] {
  const notices: AvailabilityNotice[] = [];
  const items = ticket.order.items;
  const soldOut = new Set<string>();

  for (const item of items) {
    const { set, food, drink } = setComponents(item, catalog);
    const product = productById(item.menuId, catalog);
    for (const entry of [set, product, ...(set ? [drink, ...food] : [])]) {
      if (!entry?.soldOut || soldOut.has(entry.id)) continue;
      soldOut.add(entry.id);
      const pool = "category" in entry
        ? catalog.products.filter((p) => p.category === entry.category)
        : catalog.sets;
      const choices = set && entry === drink
        ? pool.filter(({ id }) => set.drinkChoices.some((choice) => choice.productId === id))
        : pool;
      notices.push({
        kind: "soldOut", menuId: entry.id,
        alternatives: choices.filter((p) => !p.soldOut && !p.discontinued).slice(0, 3).map((p) => p.id),
      });
    }
  }

  const totals = computeConsumption(ticket, catalog);
  const available = (id: string) => Math.max(0, stock[id] ?? 0);
  for (const [materialId, required] of totals) {
    if (available(materialId) >= required) continue;
    const alternatives = new Set<string>();
    for (const item of items) {
      const product = productById(setById(item.menuId, catalog) ? item.drinkId : item.menuId, catalog);
      const current = lineConsumption(item, catalog);
      if ((current.get(materialId) ?? 0) <= 0) continue;
      for (const group of groupsFor(product, catalog)) {
        if (!group || (group.requiresOptionId && !item.optionIds.includes(group.requiresOptionId))) continue;
        const selected = item.optionIds.filter((id) => group.optionIds.includes(id));
        for (const from of selected) {
          for (const to of group.optionIds) {
            if (item.optionIds.includes(to)) continue;
            const next = lineConsumption({ ...item, optionIds: item.optionIds.map((id) => id === from ? to : id) }, catalog);
            const projected = (id: string) => (totals.get(id) ?? 0) +
              (Math.max(0, next.get(id) ?? 0) - Math.max(0, current.get(id) ?? 0)) * item.quantity;
            if (projected(materialId) >= required || projected(materialId) > available(materialId)) continue;
            if ([...next].some(([id, qty]) => qty > (current.get(id) ?? 0) && projected(id) > available(id))) continue;
            alternatives.add(to);
          }
        }
      }
    }
    notices.push({ kind: "lowStock", materialId, alternatives: [...alternatives] });
  }
  return notices;
}
