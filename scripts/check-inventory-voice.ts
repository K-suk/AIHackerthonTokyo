import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import materials from "../data/seed/materials.json";
import { parseInventoryUtterance } from "../lib/inventory-voice";
import { menu } from "../lib/menu";
import type { InventoryCommand, Material } from "../lib/types";

const milk = (qty: number, unit: "orderUnit" | "base" = "orderUnit"): InventoryCommand =>
  ({ kind: "setStock", materialId: "milk", qty, unit });
const flag = (menuId: string, soldOut: boolean): InventoryCommand => ({ kind: "setSoldOut", menuId, soldOut });
const examples: [string, (InventoryCommand | "unknown")[]][] = [
  ["牛乳あと3本", [milk(3)]],
  ["牛乳残り500ミリリットル", [milk(500, "base")]],
  ["オーツ残り1本", [{ kind: "setStock", materialId: "oat_milk", qty: 1, unit: "orderUnit" }]],
  ["豆乳はあと二本", [{ kind: "setStock", materialId: "soy_milk", qty: 2, unit: "orderUnit" }]],
  ["エスプレッソ豆あと200グラム", [{ kind: "setStock", materialId: "espresso_beans", qty: 200, unit: "base" }]],
  ["チーズケーキ売り切れ", [flag("cheesecake", true)]],
  ["クロワッサン復活", [flag("croissant", false)]],
  ["牛乳あと3本、チーズケーキ売り切れ", [milk(3), flag("cheesecake", true)]],
  ["牛乳を2本追加して", ["unknown"]],
  ["紅茶の葉があと5袋", ["unknown"]],
];

async function main() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(resolve(process.cwd(), file));
    } catch {
      // 環境変数がプロセスから設定されているときも実行できる。
    }
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY を設定してください。");
  let passed = 0;
  for (const [input, expected] of examples) {
    const output = await parseInventoryUtterance(input, menu, materials as Material[]);
    const actual = output.map((command) => command.kind === "unknown" ? "unknown" : command);
    const ok = isDeepStrictEqual(actual, expected);
    if (ok) passed++;
    console.log(`${ok ? "OK" : "NG"} ${input}${ok ? "" : " → " + JSON.stringify(actual)}`);
  }
  console.log(`${passed}/${examples.length} 正解`);
  if (passed < 8) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "音声解釈テストに失敗しました。");
  process.exitCode = 1;
});
