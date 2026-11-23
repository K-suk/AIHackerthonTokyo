import { z } from "zod";

const size = z.enum(["S", "T", "G"]);
const price = z.number().int().nonnegative();
const name = z.string().trim().min(1);
const recipeEntry = z.object({ materialId: name, qty: z.number() });
const recipe = z.partialRecord(z.enum(["S", "T", "G", "default"]), z.array(
  recipeEntry.extend({ qty: z.number().nonnegative() }),
));
const itemFields = {
  id: name,
  name,
  aliases: z.array(name),
  price,
  soldOut: z.boolean().optional(),
  discontinued: z.boolean().optional(),
};
const product = z.object({
  ...itemFields,
  category: name,
  temperature: z.enum(["hot", "ice"]).optional(),
  sizePrices: z.partialRecord(size, price).optional(),
  defaultSize: size.optional(),
  optionGroupIds: z.array(name),
  recipe: recipe.optional(),
});
const menuSet = z.object({
  ...itemFields,
  includedItems: z.array(name),
  drinkChoices: z.array(z.object({ productId: name, priceDiff: z.number().int() })),
});
const option = z.object({
  name,
  aliases: z.array(name),
  priceDiff: z.number().int(),
  recipeDelta: z.array(recipeEntry).optional(),
});
const optionGroup = z.object({
  name,
  optionIds: z.array(name),
  maxSelections: z.number().int().positive(),
  requiresOptionId: name.optional(),
});
export const catalogSchema = z.object({
  currency: z.string().optional(),
  products: z.array(product),
  sets: z.array(menuSet),
  options: z.record(name, option),
  optionGroups: z.record(name, optionGroup),
});
