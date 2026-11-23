import { connection } from "next/server";
import AppHeader from "@/components/AppHeader";
import { staffNames } from "@/app/api/inventory/access";
import MenuPanel from "./menu-panel";
import styles from "./menu.module.css";

export const metadata = { title: "メニュー管理 — 声レジ" };

export default async function AdminMenuPage() {
  await connection();
  return <main className="page">
    <AppHeader />
    <section className={styles.workspace}>
      <h1>メニュー管理</h1>
      <MenuPanel staff={staffNames()} configured={Boolean(process.env.STORE_PASSCODE_HASH)} localPhotos={!process.env.VERCEL} />
    </section>
  </main>;
}
