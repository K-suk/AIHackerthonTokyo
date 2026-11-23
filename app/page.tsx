import { connection } from "next/server";
import { getCatalog } from "@/lib/db/catalog";
import Register from "./register";

export default async function Home() {
  await connection();
  const catalog = await getCatalog();
  const registerCatalog = {
    ...catalog,
    products: catalog.products.map(({ recipe: _recipe, ...product }) => product),
    options: Object.fromEntries(Object.entries(catalog.options).map(
      ([id, { recipeDelta: _recipeDelta, ...option }]) => [id, option],
    )),
  };
  return <Register catalog={registerCatalog} browserRecording={Boolean(process.env.AQUA_API_KEY?.trim())} />;
}
