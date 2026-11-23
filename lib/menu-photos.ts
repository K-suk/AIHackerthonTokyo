import { menu } from "./menu";

export const uploadName = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const bundledPhotos = new Set([...menu.products, ...menu.sets].map(({ id }) => id));

export function menuPhoto(id: string, entry?: object): string | null {
  const photo = entry && "photo" in entry ? entry.photo : undefined;
  return typeof photo === "string" && uploadName.test(photo)
    ? "/api/menu/photos/" + photo
    : bundledPhotos.has(id) ? "/menu/" + encodeURIComponent(id) + ".jpg" : null;
}
