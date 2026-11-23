"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { categoriesFor } from "@/lib/menu-categories";
import { priceLabel } from "@/lib/menu";
import type { Catalog, Material } from "@/lib/types";
import type { MenuFieldErrors, MenuSave } from "@/lib/menu-admin";
import MenuEditor from "./menu-editor";
import styles from "./menu.module.css";

export type MenuData = {
  catalog: Catalog;
  version: number;
  updatedAt: string;
  updatedBy: string;
  materials: Pick<Material, "id" | "name" | "unit">[];
};
export type MenuSelection = { kind: MenuSave["kind"]; id: string | null };

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});
const normalize = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");

class RequestError extends Error {
  constructor(message: string, readonly fields?: MenuFieldErrors) {
    super(message);
  }
}

export default function MenuPanel({ staff, configured, localPhotos }: {
  staff: string[]; configured: boolean; localPhotos: boolean;
}) {
  const router = useRouter();
  const [operator, setOperator] = useState(staff[0]);
  const [passcode, setPasscode] = useState("");
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<MenuFieldErrors>({});
  const [selection, setSelection] = useState<MenuSelection | null>(null);
  const [tab, setTab] = useState<"items" | "options">("items");
  const [search, setSearch] = useState("");

  async function request<T>(path = "/api/menu", method = "GET", body?: FormData | string): Promise<T> {
    const headers = new Headers({
      "x-store-passcode": encodeURIComponent(passcode),
      "x-store-staff": encodeURIComponent(operator),
    });
    if (typeof body === "string") headers.set("Content-Type", "application/json");
    const response = await fetch(path, { method, body, headers, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new RequestError(result.error ?? "操作に失敗しました。", result.fields);
    return result as T;
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setMessage("");
    setFields({});
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作に失敗しました。");
      if (failure instanceof RequestError) setFields(failure.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setMenu(await request<MenuData>());
  }

  function openEditor(next: MenuSelection | null) {
    setSelection(next);
    setFields({});
    setError("");
    setMessage("");
  }

  function save(change: MenuSave, photo: File | null) {
    const body = new FormData();
    body.set("payload", JSON.stringify(change));
    if (photo) body.set("photo", photo);
    return run(async () => {
      await request("/api/menu", "PUT", body);
      setSelection(null);
      setMessage(`${change.entry.name}を保存しました。`);
      await refresh();
      router.refresh();
    });
  }

  const matches = ({ name, aliases }: { name: string; aliases: string[] }) =>
    [name, ...aliases].some((term) => normalize(term).includes(normalize(search)));

  return <>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {!menu ? <form className={styles.access} onSubmit={(event) => { event.preventDefault(); void run(refresh); }}>
      {!configured && <p>メニュー管理を開くには店舗パスコードの設定が必要です。</p>}
      <label>担当者<select value={operator} disabled={busy || !configured} onChange={(event) => setOperator(event.currentTarget.value)}>
        {staff.map((name) => <option key={name}>{name}</option>)}
      </select></label>
      <label>店舗パスコード<input autoComplete="current-password" type="password" required value={passcode}
        onChange={(event) => setPasscode(event.currentTarget.value)} disabled={busy || !configured} /></label>
      <button type="submit" className={styles.primary} disabled={busy || !configured}>メニュー管理を開く</button>
    </form> : <>
      <div className={styles.toolbar}>
        <span>最終更新 {timeFormat.format(new Date(menu.updatedAt))} · {menu.updatedBy}</span>
        <div>
          <button type="button" disabled={busy} onClick={() => void run(refresh)}>最新を読み込む</button>
          <button type="button" disabled={busy} onClick={() => {
            openEditor(null); setMenu(null); setPasscode(""); setSearch("");
          }}>閉じる</button>
        </div>
      </div>
      {selection ? <MenuEditor key={selection.kind + ":" + selection.id + ":" + menu.version}
        menu={menu} selection={selection} fields={fields} busy={busy} localPhotos={localPhotos}
        onSave={save} onClose={() => openEditor(null)} />
      : <>
        <div className={styles.toolbar}>
          <div role="group" aria-label="編集対象">
            <button type="button" aria-pressed={tab === "items"} onClick={() => { setTab("items"); setSearch(""); }}>商品・セット</button>
            <button type="button" aria-pressed={tab === "options"} onClick={() => { setTab("options"); setSearch(""); }}>オプション</button>
          </div>
          <div>
            {tab === "items" ? <>
              <button type="button" className={styles.primary} onClick={() => openEditor({ kind: "product", id: null })}>商品を追加</button>
              <button type="button" onClick={() => openEditor({ kind: "set", id: null })}>セットを追加</button>
            </> : <button type="button" className={styles.primary}
              onClick={() => openEditor({ kind: "option", id: null })}>オプションを追加</button>}
          </div>
        </div>
        <label className={styles.search}>名前・別名で検索<input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label>
        {tab === "items" ? categoriesFor(menu.catalog.products).map(({ id, label }) => {
          const entries = (id === "set" ? menu.catalog.sets : menu.catalog.products.filter((product) => product.category === id)).filter(matches);
          if (!entries.length) return null;
          return <section className={styles.section} key={id} aria-label={label}>
            <h2>{label}</h2>
            <ul className={styles.rows}>{entries.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><span>{priceLabel(item.price)}{item.discontinued ? " · 販売終了" : ""}</span></div>
              <div>
                <button type="button" role="switch" aria-label={`${item.name}の品切れ`} aria-checked={Boolean(item.soldOut)}
                  disabled={busy || item.discontinued} onClick={() => void run(async () => {
                    await request(`/api/menu/items/${encodeURIComponent(item.id)}/sold-out`, "PATCH", JSON.stringify({ soldOut: !item.soldOut }));
                    await refresh(); router.refresh();
                  })}>{item.soldOut ? "品切れ" : "販売中"}</button>
                <button type="button" aria-label={`${item.name}を編集`}
                  onClick={() => openEditor({ kind: id === "set" ? "set" : "product", id: item.id })}>編集</button>
              </div>
            </li>)}</ul>
          </section>;
        }) : <section className={styles.section} aria-label="オプション一覧">
          <ul className={styles.rows}>{Object.entries(menu.catalog.options).filter(([, option]) => matches(option)).map(([id, option]) => <li key={id}>
            <div><strong>{option.name}</strong><span>{priceLabel(option.priceDiff)}</span></div>
            <button type="button" aria-label={`${option.name}を編集`} onClick={() => openEditor({ kind: "option", id })}>編集</button>
          </li>)}</ul>
        </section>}
      </>}
    </>}
  </>;
}
