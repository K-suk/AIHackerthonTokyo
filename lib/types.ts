// 2人で共有する型。カタログの構成要素も含め、ここを単一の情報源にする。
// 既存コード（menu.ts / order.ts など）はここから型を取り込む。

export type Size = "S" | "T" | "G";
export type Temperature = "hot" | "ice";

// レシピ（1商品の消費材料）。友達の在庫機能が参照する。
export type RecipeLine = { materialId: string; qty: number };
export type Recipe = Partial<Record<Size | "default", RecipeLine[]>>;

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
  // 在庫・メニュー管理（友達の担当）で使う追加フィールド
  recipe?: Recipe;
  soldOut?: boolean;
  discontinued?: boolean;
};

export type MenuSet = {
  id: string;
  name: string;
  aliases: string[];
  price: number;
  includedItems: string[];
  drinkChoices: { productId: string; priceDiff: number }[];
  soldOut?: boolean;
  discontinued?: boolean;
};

export type Option = {
  name: string;
  aliases: string[];
  priceDiff: number;
  recipeDelta?: RecipeLine[];
};

export type OptionGroup = {
  name: string;
  optionIds: string[];
  maxSelections: number;
  requiresOptionId?: string;
};

// メニュー全体（= fukusho-menu-mock.json の形。DB の catalog.json に保存する）
export type Catalog = {
  currency?: string;
  products: Product[];
  sets: MenuSet[];
  options: Record<string, Option>;
  optionGroups: Record<string, OptionGroup>;
};

// 材料（友達の在庫機能）
export type Material = {
  id: string;
  name: string;
  unit: "ml" | "g" | "pcs";
  stock: number;
  reorderPoint: number;
  orderUnit: number;
  orderUnitLabel: string;
};

// 伝票に足す在庫由来の注意
export type AvailabilityNotice =
  | { kind: "soldOut"; menuId: string; alternatives: string[] } // 確定不可
  | { kind: "lowStock"; materialId: string; alternatives: string[] }; // 確定可の注意

// 日報の「明日の発注予定」
export type OrderSuggestion = {
  materialId: string;
  name: string;
  units: number;
  unitLabel: string;
  todayUsage: number;
  stock: number;
};

// 在庫の音声操作コマンド
export type InventoryCommand =
  | { kind: "setStock"; materialId: string; qty: number; unit: "orderUnit" | "base" }
  | { kind: "setSoldOut"; menuId: string; soldOut: boolean }
  | { kind: "unknown"; text: string };

// 確定済み注文（DB の orders 行に対応）
export type ConfirmedOrder = {
  id: string;
  businessDate: string;
  confirmedAt: string;
  channel: "counter" | "phone";
  ticket: Ticket;
  total: number;
  status: "confirmed" | "cancelled";
  createdBy: string;
};

export type EventCategory = "equipment" | "customer" | "staff" | "other" | "reflection";

// LLM が注文画面の発話から抽出する出来事（reflection 以外）
export type ParsedEvent = {
  text: string;
  category: "equipment" | "customer" | "staff" | "other";
  needsAction: boolean;
};

// 発話の振り分け結果（intent）
export type Intent = "order" | "event" | "inventory";

// 日報の集計（コードで算出。数値はここが唯一の正）
export type DayAggregate = {
  salesTotal: number;
  orderCount: number;
  counterCount: number;
  phoneCount: number;
  itemQuantities: { name: string; quantity: number }[];
  topOptionIds: { optionId: string; count: number }[];
  hourlyCounts: { hour: number; count: number }[];
  events: EventMemo[]; // reflection 以外。要対応を先頭に
  reflections: EventMemo[]; // reflection のみ。時刻順
};

// 出来事メモ（DB の events 行に対応）
export type EventMemo = {
  id: string;
  businessDate: string;
  createdAt: string;
  text: string;
  category: EventCategory;
  needsAction: boolean;
  createdBy: string;
};

// --- 既存の注文解析・伝票の型（order.ts から再 export して集約）---
export type ParsedItem = {
  raw: string;
  menuId: string | null;
  quantity: number;
  size: Size | null;
  temperature: Temperature | null;
  drinkId: string | null;
  optionIds: string[];
  candidateIds: string[];
  uncertain: boolean;
};

export type ParsedOrder = {
  items: ParsedItem[];
  pickupRequested?: boolean;
  customerName: string | null;
  pickupTime: string | null;
  pickupDate: string | null;
  unparsed: string[];
};

export type Correction = { label: string; patch: Partial<ParsedItem> };
export type Issue = { message: string; choices: Correction[]; uncertain?: boolean };
export type TicketLine = {
  item: ParsedItem;
  name: string;
  imageId: string | null;
  details: string[];
  amount: number | null;
  issues: Issue[];
};

export type Ticket = {
  order: ParsedOrder;
  lines: TicketLine[];
  total: number | null;
};
