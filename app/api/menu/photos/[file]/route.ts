import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { uploadName } from "@/lib/menu-photos";

const mime: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!uploadName.test(file)) return new Response(null, { status: 404 });
  try {
    const data = await readFile(join(process.cwd(), "public", "uploads", file));
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": mime[file.split(".").pop()!],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
