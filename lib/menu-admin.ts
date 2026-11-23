import { z } from "zod";
import { menuSetSchema, optionSchema, productSchema } from "./catalog-schema";

const meta = {
  id: z.string().max(80).nullable(),
  version: z.number().int().positive(),
  confirmPrices: z.boolean().default(false),
};
export const menuSaveSchema = z.discriminatedUnion("kind", [
  z.object({ ...meta, kind: z.literal("product"), entry: productSchema.omit({ id: true, photo: true }) }),
  z.object({ ...meta, kind: z.literal("set"), entry: menuSetSchema.omit({ id: true, photo: true }) }),
  z.object({ ...meta, kind: z.literal("option"), entry: optionSchema, groups: z.array(z.string()).min(1) }),
]);

export type MenuSave = z.input<typeof menuSaveSchema>;
export type MenuFieldErrors = Record<string, string>;

export function priceChanges(
  before: { price?: number; sizePrices?: Record<string, number>; priceDiff?: number },
  after: typeof before,
) {
  const changes = [];
  for (const [label, left, right] of [
    ["価格", before.price, after.price],
    ...["S", "T", "G"].map((size) => [size, before.sizePrices?.[size], after.sizePrices?.[size]] as const),
    ["価格差", before.priceDiff, after.priceDiff],
  ] as const) {
    if (left !== right) changes.push({ label, before: left, after: right });
  }
  return changes;
}

const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");

export function nameErrors(
  entry: { name: string; aliases: string[] },
  others: { name: string; aliases: string[] }[],
): MenuFieldErrors {
  const occupied = new Map(others.flatMap(({ name, aliases }) => [name, ...aliases].map((value) => [normalized(value), name])));
  const errors: MenuFieldErrors = {};
  const existingName = occupied.get(normalized(entry.name));
  if (existingName) errors.name = `「${existingName}」の名前または別名と重複しています。`;
  const own = new Set([normalized(entry.name)]);
  for (const alias of entry.aliases) {
    const key = normalized(alias);
    const owner = occupied.get(key);
    if (owner) errors.aliases = `別名「${alias}」は「${owner}」で使われています。`;
    else if (own.has(key)) errors.aliases = `別名「${alias}」が重複しています。`;
    own.add(key);
    if (errors.aliases) break;
  }
  return errors;
}
