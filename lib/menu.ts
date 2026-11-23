import fixture from "../fukusho-menu-mock.json";
import type { Catalog, MenuSet, Product } from "./types";

// 型は lib/types.ts に集約。既存の import 互換のため再 export する。
export type { Size, Temperature, Product, MenuSet, Option, OptionGroup, Catalog } from "./types";

// フィクスチャ由来の既定カタログ。
// クライアント側（同期的に必要な画面）と、DB未設定時のフォールバックに使う。
export const menu: Catalog = fixture as unknown as Catalog;

// 以降のヘルパーは任意のカタログを受け取れる。
// 省略時は既定カタログ（menu）を使うため、既存の呼び出しはそのまま動く。
export function productById(id: string | null, catalog: Catalog = menu): Product | undefined {
  return catalog.products.find((product) => product.id === id);
}

export function setById(id: string | null, catalog: Catalog = menu): MenuSet | undefined {
  return catalog.sets.find((set) => set.id === id);
}

export function optionById(id: string, catalog: Catalog = menu) {
  return Object.hasOwn(catalog.options, id) ? catalog.options[id] : undefined;
}

export function groupsFor(product: Product | undefined, catalog: Catalog = menu) {
  return product?.optionGroupIds.map((id) => catalog.optionGroups[id]) ?? [];
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

export function priceLabel(price: number) {
  return yen.format(price).replace("￥", "¥");
}
