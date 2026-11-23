const maxAudioSize = 4_000_000;

const audioExtensions: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export async function POST(request: Request) {
  const key = process.env.AQUA_API_KEY;
  if (!key) return Response.json({ error: "Aqua VoiceのAPIキーが未設定です。" }, { status: 503 });

  if (Number(request.headers.get("content-length")) > maxAudioSize + 8192) {
    return Response.json({ error: "録音が長すぎます。短く区切ってお試しください。" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const recordingId = form?.get("recordingId");
  if (!(audio instanceof File) || !audio.size || audio.size > maxAudioSize) {
    return Response.json({ error: "録音を読み取れませんでした。" }, { status: 400 });
  }

  const type = audio.type.split(";")[0];
  const extension = Object.hasOwn(audioExtensions, type) ? audioExtensions[type] : undefined;
  if (!extension) return Response.json({ error: "この録音形式には対応していません。" }, { status: 415 });

  const payload = new FormData();
  payload.set("file", audio, "order." + extension);
  payload.set("model", "avalon-2");
  payload.set("language", "ja");

  const headers: Record<string, string> = { Authorization: "Bearer " + key };
  if (typeof recordingId === "string" && /^[\w-]{1,80}$/.test(recordingId)) headers["Idempotency-Key"] = recordingId;
  try {
    const response = await fetch("https://api.aquavoice.com/v1/audio/transcriptions", {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return Response.json({ error: "Aqua VoiceのAPIキーまたは文字起こし権限を確認してください。" }, { status: 503 });
      }
      if (response.status === 429) {
        return Response.json({ error: "Aqua Voiceが混み合っています。少し待って再試行してください。" }, { status: 429 });
      }
      return Response.json({ error: "Aqua Voiceで文字にできませんでした。再試行できます。" }, { status: 502 });
    }
    const data = await response.json();
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) return Response.json({ error: "声が聞き取れませんでした。もう一度お試しください。" }, { status: 422 });
    return Response.json({ text });
  } catch {
    return Response.json({ error: "Aqua Voiceとの通信が完了しませんでした。再試行できます。" }, { status: 502 });
  }
}
