import fixture from "../fukusho-menu-mock.json";

export type Size = "S" | "T" | "G";
export type Temperature = "hot" | "ice";

export type Product = {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  price: number;
  temperature?: Temperature;
  sizePrices?: Partial<Record<Size, number>>;
  defaultSize?: Size;
  optionGroupIds: string[];
};

export type MenuSet = {
  id: string;
  name: string;
  aliases: string[];
  price: number;
  includedItems: string[];
  drinkChoices: { productId: string; priceDiff: number }[];
};

type Option = { name: string; aliases: string[]; priceDiff: number };
type OptionGroup = { name: string; optionIds: string[]; maxSelections: number; requiresOptionId?: string };

export const menu: {
  products: Product[];
  sets: MenuSet[];
  options: Record<string, Option>;
  optionGroups: Record<string, OptionGroup>;
} = fixture as {
  products: Product[];
  sets: MenuSet[];
  options: Record<string, Option>;
  optionGroups: Record<string, OptionGroup>;
};

export function productById(id: string | null) {
  return menu.products.find((product) => product.id === id);
}

export function setById(id: string | null) {
  return menu.sets.find((set) => set.id === id);
}

export function optionById(id: string) {
  return Object.hasOwn(menu.options, id) ? menu.options[id] : undefined;
}

export function groupsFor(product?: Product) {
  return product?.optionGroupIds.map((id) => menu.optionGroups[id]) ?? [];
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

export function priceLabel(price: number) {
  return yen.format(price).replace("￥", "¥");
}
