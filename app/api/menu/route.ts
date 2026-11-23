import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { inventoryError, inventoryStaff } from "@/app/api/inventory/access";
import { clearCatalogCache, lockCatalog, writeLockedCatalog } from "@/lib/db/catalog";
import { getSql, withTransaction } from "@/lib/db/client";
import { listMaterials } from "@/lib/db/materials";
import { getCatalogVersion } from "@/lib/db/orders";
import { menuSaveSchema, nameErrors, priceChanges } from "@/lib/menu-admin";
import type { MenuFieldErrors } from "@/lib/menu-admin";
import type { Catalog } from "@/lib/types";

export const runtime = "nodejs";

type MenuRecord = {
  catalog: Catalog;
  version: number;
  updatedAt: Date;
  updatedBy: string;
};

class MenuError extends Error {
  constructor(message: string, readonly status: number, readonly fields?: MenuFieldErrors) {
    super(message);
  }
}

const failField = (field: string, message: string): never => {
  throw new MenuError(message, 422, { [field]: message });
};

async function readMenu() {
  const sql = getSql();
  const [[record], allMaterials] = await Promise.all([
    sql<MenuRecord[]>`select json as catalog, version, updated_at as "updatedAt", updated_by as "updatedBy" from catalog where id = 1`,
    listMaterials(),
  ]);
  if (!record) throw new MenuError("メニューの初期データがありません。", 404);
  return { ...record, materials: allMaterials.map(({ id, name, unit }) => ({ id, name, unit })) };
}

function responseError(error: unknown) {
  if (error instanceof MenuError) return Response.json({ error: error.message, fields: error.fields }, { status: error.status });
  return inventoryError(error);
}

export async function GET(request: Request) {
  try {
    await inventoryStaff(request);
    return Response.json(await readMenu(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return responseError(error);
  }
}

const uploads = () => join(process.cwd(), "public", "uploads");

async function readPhoto(file: unknown) {
  if (!(file instanceof File) || !file.size) return null;
  if (process.env.VERCEL) return failField("photo", "写真のアップロードはローカル版で使えます。");
  if (file.size > 3 * 1024 * 1024) return failField("photo", "写真は3MB以内にしてください。");
  const data = Buffer.from(await file.arrayBuffer());
  const extension = data.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "jpg"
    : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
    : data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" ? "webp"
    : null;
  if (!extension) return failField("photo", "JPEG・PNG・WebPの写真を選んでください。");
  return { data, name: randomUUID() + "." + extension };
}

export async function PUT(request: Request) {
  let writtenPhoto: string | null = null;
  let committed = false;
  try {
    const staff = await inventoryStaff(request);
    let payload: unknown;
    let photo: Awaited<ReturnType<typeof readPhoto>> = null;
    try {
      if (request.headers.get("content-type")?.includes("multipart/form-data")) {
        if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024) {
          return failField("photo", "写真は3MB以内にしてください。");
        }
        const form = await request.formData();
        payload = JSON.parse(String(form.get("payload")));
        photo = await readPhoto(form.get("photo"));
      } else {
        payload = await request.json();
      }
    } catch (error) {
      if (error instanceof MenuError) throw error;
      throw new MenuError("保存する内容を確認してください。", 400);
    }
    const parsed = menuSaveSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: MenuFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] === "entry" ? issue.path[1] : issue.path[0] ?? "form");
        fields[key] = key === "price" || key === "sizePrices"
          ? "0以上の整数を入力してください。"
          : key === "priceDiff" ? "整数を入力してください。"
          : key === "name" ? "名前を入力してください。"
          : key === "recipe" || key === "recipeDelta" ? "材料と分量を確認してください。"
          : "入力内容を確認してください。";
      }
      throw new MenuError("入力内容を確認してください。", 422, fields);
    }

    const { id, kind, entry } = parsed.data;
    if (photo && kind === "option") return failField("photo", "商品またはセットを選んでください。");
    const savedId = id ?? (kind + "_" + randomUUID().replaceAll("-", ""));
    const materialIds = new Set((await listMaterials()).map(({ id }) => id));
    await withTransaction(async (tx) => {
      const catalog = await lockCatalog(tx);
      if (await getCatalogVersion(tx) !== parsed.data.version) {
        throw new MenuError("別の操作でメニューが更新されました。最新の内容を読み込んでください。", 409);
      }

      const all = [...catalog.products, ...catalog.sets];
      const previous = kind === "option"
        ? id && Object.hasOwn(catalog.options, id) ? catalog.options[id] : undefined
        : (kind === "product" ? catalog.products : catalog.sets).find((item) => item.id === id);
      if (id && !previous) throw new MenuError("編集する項目が見つかりません。", 404);

      const others = kind === "option"
        ? Object.entries(catalog.options).filter(([key]) => key !== id).map(([, option]) => option)
        : all.filter((item) => item.id !== id);
      const fields = nameErrors(entry, others);
      if (Object.keys(fields).length) throw new MenuError("名前や別名を確認してください。", 422, fields);
      if (previous && priceChanges(previous, entry).length && !parsed.data.confirmPrices) {
        return failField("price", "価格変更の確認が必要です。");
      }

      if (parsed.data.kind === "product") {
        const product = parsed.data.entry;
        if (["all", "set"].includes(product.category)) return failField("category", "商品のカテゴリを選んでください。");
        if (!product.optionGroupIds.every((group) => Object.hasOwn(catalog.optionGroups, group))) {
          return failField("optionGroupIds", "存在するオプショングループを選んでください。");
        }
        const sizes = Object.keys(product.sizePrices ?? {});
        if ((sizes.length || product.defaultSize) && (product.defaultSize === undefined || !sizes.includes(product.defaultSize))) {
          return failField("defaultSize", "価格を入力したサイズを既定サイズにしてください。");
        }
        if (product.defaultSize && product.sizePrices?.[product.defaultSize] !== product.price) {
          return failField("price", "基本価格は既定サイズの価格に合わせてください。");
        }
        if (Object.values(product.recipe ?? {}).flat().some(({ materialId }) => !materialIds.has(materialId))) {
          return failField("recipe", "存在する材料を指定してください。");
        }
        const oldPhoto = previous && "photo" in previous ? previous.photo : undefined;
        const saved = { ...product, id: savedId, photo: photo?.name ?? oldPhoto };
        catalog.products = id ? catalog.products.map((item) => item.id === id ? saved : item) : [...catalog.products, saved];
      } else if (parsed.data.kind === "set") {
        const set = parsed.data.entry;
        const drinks = new Set(set.drinkChoices.map(({ productId }) => productId));
        if (!drinks.size || drinks.size !== set.drinkChoices.length || [...drinks].some((drink) => !catalog.products.some((item) => item.id === drink))) {
          return failField("drinkChoices", "重複しないセットドリンクを1つ以上選んでください。");
        }
        const oldPhoto = previous && "photo" in previous ? previous.photo : undefined;
        const saved = { ...set, id: savedId, photo: photo?.name ?? oldPhoto };
        catalog.sets = id ? catalog.sets.map((item) => item.id === id ? saved : item) : [...catalog.sets, saved];
      } else {
        const option = parsed.data.entry;
        const groups = new Set(parsed.data.groups);
        if ([...groups].some((group) => !Object.hasOwn(catalog.optionGroups, group))) {
          return failField("groups", "存在するオプショングループを選んでください。");
        }
        if (option.recipeDelta?.some(({ materialId }) => !materialIds.has(materialId))) {
          return failField("recipeDelta", "存在する材料を指定してください。");
        }
        catalog.options[savedId] = option;
        for (const [groupId, group] of Object.entries(catalog.optionGroups)) {
          if (groups.has(groupId)) {
            if (!group.optionIds.includes(savedId)) group.optionIds.push(savedId);
          } else {
            group.optionIds = group.optionIds.filter((optionId) => optionId !== savedId);
          }
        }
      }

      if (photo) {
        await mkdir(uploads(), { recursive: true });
        const file = join(uploads(), photo.name);
        await writeFile(file, photo.data, { flag: "wx" });
        writtenPhoto = file;
      }
      await writeLockedCatalog(tx, catalog, staff);
    });
    committed = true;
    clearCatalogCache();
    revalidatePath("/");
    revalidatePath("/admin/menu");
    return Response.json({ id: savedId, version: parsed.data.version + 1 });
  } catch (error) {
    if (!committed && writtenPhoto) await unlink(writtenPhoto).catch(() => {});
    return responseError(error);
  }
}
