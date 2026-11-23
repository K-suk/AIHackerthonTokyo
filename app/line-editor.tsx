"use client";

import { groupsFor, optionById, priceLabel, productById, setById } from "@/lib/menu";
import type { ParsedItem } from "@/lib/order";

type Props = {
  item: ParsedItem;
  index: number;
  onChange: (patch: Partial<ParsedItem>) => void;
  onRemove: () => void;
};

export default function LineEditor({ item, index, onChange, onRemove }: Props) {
  const set = setById(item.menuId);
  const product = productById(set ? item.drinkId : item.menuId);
  const sizes = Object.keys(product?.sizePrices ?? {}) as NonNullable<ParsedItem["size"]>[];
  const groups = groupsFor(product);
  const id = "line-" + index;

  function toggle(optionId: string, groupIds: string[], limit: number) {
    const selected = item.optionIds.includes(optionId);
    const next = selected
      ? item.optionIds.filter((option) => option !== optionId)
      : [...item.optionIds.filter((option) => limit > 1 || !groupIds.includes(option)), optionId];
    onChange({ optionIds: next });
  }

  return <div id={id + "-editor"} className="line-editor">
    <div className="editor-controls">
      <label htmlFor={id + "-quantity"}>
        数量
        <input id={id + "-quantity"} type="number" min={1} max={99} value={item.quantity}
          onChange={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (Number.isInteger(value) && value > 0 && value <= 99) onChange({ quantity: value });
          }} />
      </label>
      {set && <label htmlFor={id + "-drink"}>
        セットドリンク
        <select id={id + "-drink"} value={item.drinkId ?? ""} onChange={(event) => {
          const value = event.currentTarget.value;
          onChange({ drinkId: value || null, size: null, temperature: null, optionIds: [] });
        }}>
          <option value="">選択してください</option>
          {set.drinkChoices.map(({ productId, priceDiff }) => <option key={productId} value={productId}>
            {productById(productId)?.name}{priceDiff > 0 ? " ＋" + priceLabel(priceDiff) : ""}
          </option>)}
        </select>
      </label>}
      {sizes.length > 0 && <label htmlFor={id + "-size"}>
        サイズ
        <select id={id + "-size"} value={item.size ?? ""} onChange={(event) => onChange({
          size: (event.currentTarget.value || null) as ParsedItem["size"],
        })}>
          <option value="">標準（{product?.defaultSize}）</option>
          {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>}
    </div>
    {groups.map((group) => <fieldset key={group.name}>
      <legend>{group.name}</legend>
      <div className="option-buttons">
        {group.optionIds.map((optionId) => {
          const option = optionById(optionId);
          if (!option) return null;
          return <button key={optionId} type="button" aria-pressed={item.optionIds.includes(optionId)}
            onClick={() => toggle(optionId, group.optionIds, group.maxSelections)}>
            {option.name}{option.priceDiff > 0 && " ＋" + priceLabel(option.priceDiff)}
          </button>;
        })}
      </div>
    </fieldset>)}
    <button type="button" className="remove-button" onClick={onRemove}>商品を取り消す</button>
  </div>;
}
