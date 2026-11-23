import { z } from "zod";
import { deleteEvent, updateEvent } from "@/lib/db/events";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  category: z.enum(["equipment", "customer", "staff", "other", "reflection"]).optional(),
  needsAction: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) return Response.json({ error: "出来事が見つかりません。" }, { status: 400 });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "更新内容を確認してください。" }, { status: 400 });
    const event = await updateEvent(id, parsed.data);
    if (!event) return Response.json({ error: "出来事が見つかりません。" }, { status: 404 });
    return Response.json({ event });
  } catch (error) {
    console.error("[events PATCH]", error);
    return Response.json({ error: "出来事を更新できませんでした。" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) return Response.json({ error: "出来事が見つかりません。" }, { status: 400 });
    const ok = await deleteEvent(id);
    if (!ok) return Response.json({ error: "出来事が見つかりません。" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[events DELETE]", error);
    return Response.json({ error: "出来事を削除できませんでした。" }, { status: 502 });
  }
}
