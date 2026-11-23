"use client";

import { groupsFor, optionById, priceLabel, productById, setById } from "@/lib/menu";
import type { Catalog, ParsedItem, Product } from "@/lib/types";

type Props = {
  catalog: Catalog;
  item: ParsedItem;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<ParsedItem>) => void;
  onRemove: () => void;
};

function supportedOptions(optionIds: string[], groups: ReturnType<typeof groupsFor>) {
  const supported = optionIds.filter((id) => groups.some((group) => group.optionIds.includes(id)));
  return groups.flatMap((group) => {
    if (group.requiresOptionId && !supported.includes(group.requiresOptionId)) return [];
    return supported.filter((id) => group.optionIds.includes(id)).slice(0, group.maxSelections);
  });
}

function compatibleSettings(item: ParsedItem, product: Product | undefined, catalog: Catalog) {
  return {
    size: item.size && Object.hasOwn(product?.sizePrices ?? {}, item.size) ? item.size : null,
    temperature: null,
    optionIds: supportedOptions(item.optionIds, groupsFor(product, catalog)),
  };
}

export default function LineEditor({ catalog, item, index, disabled, onChange, onRemove }: Props) {
  const set = setById(item.menuId, catalog);
  const product = productById(set ? item.drinkId : item.menuId, catalog);
  const sizes = Object.keys(product?.sizePrices ?? {}) as NonNullable<ParsedItem["size"]>[];
  const groups = groupsFor(product, catalog);
  const id = "line-" + index;
  const menuId = set || product ? item.menuId ?? "" : "";

  function changeMenu(menuId: string) {
    const nextSet = setById(menuId, catalog);
    const drinkId = nextSet?.drinkChoices.some((choice) => choice.productId === item.drinkId) ? item.drinkId : null;
    onChange({
      ...compatibleSettings(item, productById(nextSet ? drinkId : menuId, catalog), catalog),
      menuId,
      drinkId,
      raw: "",
      uncertain: false,
      candidateIds: [],
    });
  }

  function changeDrink(drinkId: string | null) {
    onChange({ ...compatibleSettings(item, productById(drinkId, catalog), catalog), drinkId });
  }

  function toggle(optionId: string) {
    const next = item.optionIds.includes(optionId)
      ? item.optionIds.filter((id) => id !== optionId)
      : [optionId, ...item.optionIds];
    onChange({ optionIds: supportedOptions(next, groups) });
  }

  return <div id={id + "-editor"} className="line-editor">
    <div className="editor-controls">
      <div className="editor-field editor-product">
        <label htmlFor={id + "-product"}>商品</label>
        <select id={id + "-product"} disabled={disabled} value={menuId}
          onChange={(event) => changeMenu(event.currentTarget.value)}>
          <option value="" disabled>商品を選択</option>
          <optgroup label="単品">
            {catalog.products.filter((entry) => !entry.discontinued || entry.id === menuId)
              .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </optgroup>
          <optgroup label="セット">
            {catalog.sets.filter((entry) => !entry.discontinued || entry.id === menuId)
              .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </optgroup>
        </select>
      </div>
      <div className="editor-field">
        <label htmlFor={id + "-quantity"}>数量</label>
        <div className="quantity-stepper">
          <button type="button" aria-label="数量を減らす" disabled={disabled || item.quantity <= 1}
            onClick={() => onChange({ quantity: item.quantity - 1 })}>−</button>
          <input id={id + "-quantity"} type="number" min={1} max={99} disabled={disabled} value={item.quantity}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value) && value > 0 && value <= 99) onChange({ quantity: value });
            }} />
          <button type="button" aria-label="数量を増やす" disabled={disabled || item.quantity >= 99}
            onClick={() => onChange({ quantity: item.quantity + 1 })}>＋</button>
        </div>
      </div>
      {set && <div className="editor-field">
        <label htmlFor={id + "-drink"}>セットドリンク</label>
        <select id={id + "-drink"} disabled={disabled} value={item.drinkId ?? ""}
          onChange={(event) => changeDrink(event.currentTarget.value || null)}>
          <option value="">選択してください</option>
          {set.drinkChoices.map(({ productId, priceDiff }) => {
            const drink = productById(productId, catalog);
            if (!drink || (drink.discontinued && drink.id !== item.drinkId)) return null;
            return <option key={productId} value={productId}>
              {drink.name}{priceDiff > 0 ? " ＋" + priceLabel(priceDiff) : ""}
            </option>;
          })}
        </select>
      </div>}
      {sizes.length > 0 && <div className="editor-field">
        <label htmlFor={id + "-size"}>サイズ</label>
        <select id={id + "-size"} disabled={disabled} value={item.size ?? ""} onChange={(event) => onChange({
          size: (event.currentTarget.value || null) as ParsedItem["size"],
        })}>
          <option value="">標準（{product?.defaultSize}）</option>
          {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>}
    </div>
    {groups.map((group) => <fieldset key={group.name}>
      <legend>{group.name}</legend>
      <div className="option-buttons">
        {group.optionIds.map((optionId) => {
          const option = optionById(optionId, catalog);
          if (!option) return null;
          const selected = item.optionIds.includes(optionId);
          const requiresAnotherOption = group.requiresOptionId && !item.optionIds.includes(group.requiresOptionId);
          return <button key={optionId} type="button" aria-pressed={selected}
            disabled={disabled || (!selected && Boolean(requiresAnotherOption))} onClick={() => toggle(optionId)}>
            {option.name}{option.priceDiff > 0 && " ＋" + priceLabel(option.priceDiff)}
          </button>;
        })}
      </div>
    </fieldset>)}
    <button type="button" className="remove-button" disabled={disabled} onClick={onRemove}>商品を取り消す</button>
  </div>;
}
