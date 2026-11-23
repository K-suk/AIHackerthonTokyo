"use client";

import { useEffect, useRef, useState } from "react";
import { useRecording } from "@/app/use-recording";

// 音声入力の共通部品。録音（無音検出で自動停止）→ /api/transcribe → 文字起こし、
// の流れを、どの画面でも使えるようにまとめたもの。
// 既存の use-recording.ts と /api/transcribe の挙動は変えない。

type Props = {
  label: string; // 画面に出す案内文
  onTranscript: (text: string) => void | Promise<void>; // 文字起こしが終わったら呼ばれる
  disabled?: boolean;
};

type Status = "idle" | "transcribing" | "processing";

export default function VoiceInput({ label, onTranscript, disabled = false }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const waveformRef = useRef<HTMLSpanElement>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  function fail(message: string) {
    setError(message);
  }

  async function transcribe(audio: Blob) {
    if (requestRef.current) return;
    const request = new AbortController();
    requestRef.current = request;
    setStatus("transcribing");
    setError("");
    try {
      const form = new FormData();
      form.set("audio", audio, "order");
      form.set("recordingId", crypto.randomUUID());
      const result = await fetch("/api/transcribe", { method: "POST", body: form, signal: request.signal });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error);
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) throw new Error("声が聞き取れませんでした。もう一度お試しください。");
      if (request.signal.aborted) return;
      setTranscript(text);
      setStatus("processing");
      await onTranscript(text);
    } catch (failure) {
      if (!request.signal.aborted) fail(failure instanceof Error ? failure.message : "文字起こしに失敗しました。");
    } finally {
      requestRef.current = null;
      if (!request.signal.aborted) setStatus("idle");
    }
  }

  const recording = useRecording(
    (audio) => void transcribe(audio),
    fail,
    (level) => waveformRef.current?.style.setProperty("--level", String(Math.min(1.22, 0.35 + level * 6))),
  );

  const capturing = recording.state !== "idle";
  const blocked = disabled || status !== "idle";

  function toggle() {
    if (recording.state === "recording") {
      recording.finish();
      return;
    }
    if (recording.state === "requesting") {
      recording.cancel();
      return;
    }
    setError("");
    setTranscript("");
    void recording.start();
  }

  const message = recording.state === "requesting" ? "マイクを準備中"
    : recording.state === "recording" ? "録音中です。話し終わったら「録音を終了」を押してください。"
    : status === "transcribing" ? "文字起こし中…"
    : status === "processing" ? "文字起こしを解析中…"
    : transcript || label;

  return <div className="voice-input">
    <section className="capture-bar" aria-label={label}>
      <span className="waveform" ref={waveformRef} data-active={recording.state === "recording"} aria-hidden="true">
        {[4, 8, 15, 10, 20, 12, 7].map((height, index) => <i key={index} style={{ height }} />)}
      </span>
      <div className="transcript" role="status">{message}</div>
      <button type="button" className="record-button" data-recording={capturing} disabled={blocked} onClick={toggle}>
        <span className="mic" aria-hidden="true" />
        {recording.state === "recording" ? "録音を終了" : capturing ? "マイク準備を取り消す" : "録音開始"}
      </button>
      {recording.state === "recording" &&
        <button type="button" className="text-button" onClick={recording.cancel}>録音を取り消す</button>}
    </section>
    {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
  </div>;
}
