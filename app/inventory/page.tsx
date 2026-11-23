import { connection } from "next/server";
import AppHeader from "@/components/AppHeader";
import { staffNames } from "@/app/api/inventory/access";
import InventoryPanel from "./panel";
import styles from "./inventory.module.css";

export const metadata = { title: "在庫 — 声レジ" };

export default async function InventoryPage() {
  await connection();
  return <main className="page">
    <AppHeader />
    <section className={styles.workspace}>
      <h1>在庫</h1>
      <InventoryPanel
        staff={staffNames()}
        voiceEnabled={Boolean(process.env.AQUA_API_KEY?.trim() && process.env.OPENAI_API_KEY?.trim())}
        configured={Boolean(process.env.STORE_PASSCODE_HASH)}
      />
    </section>
  </main>;
}
