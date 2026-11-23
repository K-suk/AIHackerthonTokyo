"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import recipeSeed from "@/data/seed/recipes.json";
import { categoriesFor } from "@/lib/menu-categories";
import { priceLabel } from "@/lib/menu";
import { priceChanges } from "@/lib/menu-admin";
import type { MenuFieldErrors, MenuSave } from "@/lib/menu-admin";
import type { Recipe, RecipeLine, Size, Temperature } from "@/lib/types";
import type { MenuData, MenuSelection } from "./menu-panel";
import styles from "./menu.module.css";

const sizes = ["S", "T", "G"] as const;
const demoRecipes: Record<string, Recipe> = recipeSeed.items;
const demoDeltas: Record<string, RecipeLine[]> = recipeSeed.options;
const sizeNames = { default: "基本", S: "S", T: "T", G: "G" };
type RecipeSize = keyof typeof sizeNames;
type RecipeRow = { materialId: string; qty: string };
type DrinkRow = { productId: string; priceDiff: string };
const number = (value: string) => value.trim() ? Number(value) : NaN;
const formatRecipe = (recipe: RecipeLine[] = []) => recipe.map(({ materialId, qty }) => ({ materialId, qty: String(qty) }));
const has = (items: string[], value: string) => items.includes(value);

function Chips({ label, values, onChange, error }: {
  label: string; values: string[]; onChange: (values: string[]) => void; error?: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const value = input.trim();
    if (!value) return;
    onChange([...values, value]);
    setInput("");
  }
  return <fieldset className={styles.fieldset}>
    <legend>{label}</legend>
    {values.length > 0 && <ul className={styles.chips}>{values.map((value, i) => <li key={i}>
      {value} <button type="button" aria-label={`${value}を削除`} onClick={() => onChange(values.filter((_, index) => i !== index))}>×</button>
    </li>)}</ul>}
    <div className={styles.line}>
      <input value={input} aria-label={`${label}を入力`} aria-invalid={Boolean(error)}
        onChange={(event) => setInput(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); }
        }} />
      <button type="button" disabled={!input.trim()} onClick={add}>{label}を追加</button>
    </div>
    {error && <p className={styles.fieldError}>{error}</p>}
  </fieldset>;
}

function RecipeEditor({ rows, materials, onChange, negative, error }: {
  rows: RecipeRow[]; materials: MenuData["materials"]; onChange: (rows: RecipeRow[]) => void;
  negative?: boolean; error?: string;
}) {
  function set(index: number, patch: Partial<RecipeRow>) {
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  return <div className={styles.stack}>
    {rows.map((row, index) => <div className={styles.recipeRow} key={index}>
      <label>材料
        <select aria-label="材料" required value={row.materialId} onChange={(event) => set(index, { materialId: event.currentTarget.value })}>
          <option value="">選択</option>
          {row.materialId && !materials.some(({ id }) => id === row.materialId) && <option value={row.materialId}>{row.materialId}</option>}
          {materials.map(({ id, name, unit }) => <option key={id} value={id}>{name}（{unit === "pcs" ? "個" : unit}）</option>)}
        </select>
      </label>
      <label>分量<input type="number" step="any" min={negative ? undefined : 0} required value={row.qty}
        onChange={(event) => set(index, { qty: event.currentTarget.value })} /></label>
      <button type="button" aria-label={`材料${index + 1}を削除`}
        onClick={() => onChange(rows.filter((_, i) => i !== index))}>削除</button>
    </div>)}
    <button type="button" disabled={!materials.length}
      onClick={() => onChange([...rows, { materialId: "", qty: "" }])}>材料を追加</button>
    {!materials.length && <p>材料を登録するとレシピを編集できます。</p>}
    {error && <p className={styles.fieldError}>{error}</p>}
  </div>;
}

export default function MenuEditor({
  menu, selection, fields, busy, localPhotos, onSave, onClose,
}: {
  menu: MenuData; selection: MenuSelection; fields: MenuFieldErrors; busy: boolean; localPhotos: boolean;
  onSave: (change: MenuSave, photo: File | null) => Promise<void>; onClose: () => void;
}) {
  const { catalog, materials, version } = menu;
  const { id, kind } = selection;
  const product = kind === "product" ? catalog.products.find((item) => item.id === id) : undefined;
  const set = kind === "set" ? catalog.sets.find((item) => item.id === id) : undefined;
  const option = kind === "option" && id ? catalog.options[id] : undefined;
  const existing = product ?? set ?? option;

  const [name, setName] = useState(existing?.name ?? "");
  const [aliases, setAliases] = useState(existing?.aliases ?? []);
  const [category, setCategory] = useState(product?.category ?? "coffee");
  const [price, setPrice] = useState(existing ? String(option?.priceDiff ?? product?.price ?? set?.price ?? "") : "");
  const [sizePrices, setSizePrices] = useState(() => Object.fromEntries(sizes.map((size) =>
    [size, product?.sizePrices?.[size] === undefined ? "" : String(product.sizePrices[size])])) as Record<Size, string>);
  const [defaultSize, setDefaultSize] = useState<Size | "">(product?.defaultSize ?? "");
  const [temperature, setTemperature] = useState<Temperature | "">(product?.temperature ?? "");
  const [groups, setGroups] = useState(product?.optionGroupIds ?? (option && id ? Object.entries(catalog.optionGroups)
    .filter(([, group]) => group.optionIds.includes(id)).map(([group]) => group) : []));
  const [discontinued, setDiscontinued] = useState(product?.discontinued ?? set?.discontinued ?? false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [recipeSize, setRecipeSize] = useState<RecipeSize>("default");
  const [recipes, setRecipes] = useState<Partial<Record<RecipeSize, RecipeRow[]>>>(() => {
    const demo = product && demoRecipes[product.id];
    const recipe = product?.recipe ?? (demo && Object.values(demo).flat()
      .every(({ materialId }) => materials.some(({ id }) => id === materialId)) ? demo : undefined);
    return Object.fromEntries(Object.entries(recipe ?? {}).map(([size, rows]) => [size, formatRecipe(rows)]));
  });
  const [deltas, setDeltas] = useState(() => {
    const demo = id && demoDeltas[id];
    return formatRecipe(option?.recipeDelta ?? (demo && demo.every(({ materialId }) =>
      materials.some(({ id }) => id === materialId)) ? demo : []));
  });
  const [included, setIncluded] = useState(set?.includedItems ?? []);
  const [drinks, setDrinks] = useState<DrinkRow[]>(
    set?.drinkChoices.map(({ productId, priceDiff }) => ({ productId, priceDiff: String(priceDiff) })) ?? [],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const meta = { id, version, confirmPrices: false };
    const basics = { name: name.trim(), aliases };
    const item = { ...basics, discontinued, soldOut: product?.soldOut ?? set?.soldOut ?? false };
    const usedSizes = sizes.filter((size) => sizePrices[size].trim());
    const chosenSize = defaultSize && usedSizes.includes(defaultSize) ? defaultSize : usedSizes.includes("T") ? "T" : usedSizes[0];
    const sizeAmounts = Object.fromEntries(usedSizes.map((size) => [size, number(sizePrices[size])]));
    const base = kind === "product" && chosenSize ? sizeAmounts[chosenSize] : number(price);
    const recipeAmounts = Object.fromEntries(Object.entries(recipes).filter(([, rows]) => rows.length)
      .map(([size, rows]) => [size, rows.map(({ materialId, qty }) => ({ materialId, qty: number(qty) }))]));
    const change: MenuSave = kind === "product" ? {
      ...meta, kind, entry: {
        ...item, category: category.trim(), price: base, sizePrices: usedSizes.length ? sizeAmounts : undefined,
        defaultSize: chosenSize || undefined, temperature: temperature || undefined, optionGroupIds: groups, recipe: recipeAmounts,
      },
    } : kind === "set" ? {
      ...meta, kind, entry: {
        ...item, price: number(price), includedItems: included,
        drinkChoices: drinks.map(({ productId, priceDiff }) => ({ productId, priceDiff: number(priceDiff) })),
      },
    } : {
      ...meta, kind, groups, entry: {
        ...basics, priceDiff: number(price), recipeDelta: deltas.map(({ materialId, qty }) => ({ materialId, qty: number(qty) })),
      },
    };
    const priceDiffs = existing ? priceChanges(existing, change.entry) : [];
    if (priceDiffs.length && priceDiffs.every(({ after }) => after === undefined || Number.isFinite(after))) {
      const toPrice = (amount?: number) => amount === undefined ? "設定なし" : priceLabel(amount);
      const detail = priceDiffs.map(({ label, before, after }) =>
        `${label} ${toPrice(before)} → ${toPrice(after)}`).join("\n");
      if (!window.confirm(detail + "\nに変更します。よろしいですか？")) return;
      change.confirmPrices = true;
    }
    void onSave(change, photo);
  }

  const field = (key: string) => fields[key] && <span className={styles.fieldError}>{fields[key]}</span>;
  const toggleGroup = (group: string) => setGroups(has(groups, group) ? groups.filter((id) => id !== group) : [...groups, group]);
  const label = kind === "product" ? "商品" : kind === "set" ? "セット" : "オプション";
  const hasSizes = sizes.some((size) => sizePrices[size].trim());

  return <form className={styles.section} noValidate onSubmit={submit}>
    <h2>{label}を{id ? "編集" : "追加"}</h2>
    <fieldset disabled={busy} className={styles.formFields}>
      <label>{label}名<input value={name} aria-invalid={Boolean(fields.name)} onChange={(event) => setName(event.currentTarget.value)} />{field("name")}</label>
      <Chips label="別名" values={aliases} onChange={setAliases} error={fields.aliases} />

      {kind === "product" && <>
        <label>カテゴリ<input list="menu-categories" value={category} onChange={(event) => setCategory(event.currentTarget.value)} />{field("category")}</label>
        <datalist id="menu-categories">{categoriesFor(catalog.products).filter(({ id }) => id !== "set")
          .map(({ id, label }) => <option key={id} value={id} label={label} />)}</datalist>
        <label>温度<select aria-label="温度" value={temperature} onChange={(event) => setTemperature(event.currentTarget.value as Temperature | "")}>
          <option value="">指定なし</option><option value="hot">ホット</option><option value="ice">アイス</option>
        </select></label>
      </>}

      {(kind !== "product" || !hasSizes) && <label>{kind === "option" ? "価格差（円）" : "基本価格（円）"}
        <input type="number" step={1} min={kind === "option" ? undefined : 0} value={price} onChange={(event) => setPrice(event.currentTarget.value)} />
        {field(kind === "option" ? "priceDiff" : "price")}
      </label>}

      {kind === "product" && <fieldset className={styles.fieldset}>
        <legend>サイズ別価格（円）</legend>
        <div className={styles.sizes}>{sizes.map((size) => <label key={size}>{size}価格
          <input type="number" min={0} step={1} value={sizePrices[size]}
            onChange={(event) => setSizePrices({ ...sizePrices, [size]: event.currentTarget.value })} />
        </label>)}</div>
        {field("sizePrices")}{hasSizes && field("price")}
        {hasSizes && <label>既定サイズ<select aria-label="既定サイズ" value={defaultSize} onChange={(event) => setDefaultSize(event.currentTarget.value as Size | "")}>
          <option value="">価格を入力したサイズから選ぶ</option>
          {sizes.filter((size) => sizePrices[size].trim()).map((size) => <option key={size}>{size}</option>)}
        </select>{field("defaultSize")}</label>}
      </fieldset>}

      {kind !== "set" && <fieldset className={styles.fieldset}>
        <legend>{kind === "option" ? "所属グループ" : "使えるオプショングループ"}</legend>
        <div className={styles.checks}>{Object.entries(catalog.optionGroups).map(([id, group]) =>
          <label key={id}><input type="checkbox" checked={has(groups, id)} onChange={() => toggleGroup(id)} />{group.name}</label>)}</div>
        {field(kind === "option" ? "groups" : "optionGroupIds")}
      </fieldset>}

      {kind === "product" && <fieldset className={styles.fieldset}>
        <legend>レシピ</legend>
        <label>レシピのサイズ<select aria-label="レシピのサイズ" value={recipeSize} onChange={(event) => setRecipeSize(event.currentTarget.value as RecipeSize)}>
          {Object.entries(sizeNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <RecipeEditor rows={recipes[recipeSize] ?? []} materials={materials}
          onChange={(rows) => setRecipes({ ...recipes, [recipeSize]: rows })} error={fields.recipe} />
      </fieldset>}

      {kind === "option" && <fieldset className={styles.fieldset}>
        <legend>材料の差分</legend>
        <RecipeEditor rows={deltas} materials={materials} onChange={setDeltas} negative error={fields.recipeDelta} />
      </fieldset>}

      {kind === "set" && <>
        <Chips label="セットの内訳" values={included} onChange={setIncluded} error={fields.includedItems} />
        <fieldset className={styles.fieldset}>
          <legend>セットドリンク</legend>
          {drinks.map((row, index) => <div className={styles.recipeRow} key={index}>
            <label>ドリンク<select aria-label="ドリンク" value={row.productId} onChange={(event) => {
              setDrinks(drinks.map((item, i) => i === index ? { ...item, productId: event.currentTarget.value } : item));
            }}>
              <option value="">選択</option>
              {catalog.products.filter((item) => !item.discontinued || item.id === row.productId).map((item) =>
                <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label>価格差（円）<input type="number" step={1} value={row.priceDiff} onChange={(event) => {
              setDrinks(drinks.map((item, i) => i === index ? { ...item, priceDiff: event.currentTarget.value } : item));
            }} /></label>
            <button type="button" aria-label={`ドリンク${index + 1}を削除`} onClick={() => setDrinks(drinks.filter((_, i) => i !== index))}>削除</button>
          </div>)}
          <button type="button" onClick={() => setDrinks([...drinks, { productId: "", priceDiff: "0" }])}>ドリンクを追加</button>
          {field("drinkChoices")}
        </fieldset>
      </>}

      {kind !== "option" && <>
        {localPhotos && <label>写真<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) =>
          setPhoto(event.currentTarget.files?.[0] ?? null)} />{field("photo")}</label>}
        <label className={styles.check}><input type="checkbox" checked={discontinued} onChange={(event) =>
          setDiscontinued(event.currentTarget.checked)} />販売終了</label>
      </>}

      <div className={styles.line}>
        <button type="submit" className={styles.primary}>{busy ? "保存中…" : "保存"}</button>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>
    </fieldset>
  </form>;
}
