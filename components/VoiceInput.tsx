"use client";

import { useRef, useState } from "react";
import { useRecording } from "@/app/use-recording";

// 音声入力の共通部品。録音（無音検出で自動停止）→ /api/transcribe → 文字起こし、
// の流れを、どの画面でも使えるようにまとめたもの。
// 既存の use-recording.ts と /api/transcribe の挙動は変えない。

type Props = {
  label: string; // 画面に出す案内文
  onTranscript: (text: string) => void; // 文字起こしが終わったら呼ばれる
  disabled?: boolean;
};

type Status = "idle" | "transcribing" | "error";

export default function VoiceInput({ label, onTranscript, disabled = false }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const waveformRef = useRef<HTMLSpanElement>(null);

  function fail(message: string) {
    setError(message);
    setStatus("error");
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
      const text = String(payload.text).trim();
      setStatus("idle");
      if (text) onTranscript(text);
      else fail("声が聞き取れませんでした。もう一度お試しください。");
    } catch (failure) {
      if (!request.signal.aborted) fail(failure instanceof Error ? failure.message : "文字起こしに失敗しました。");
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }

  const recording = useRecording(
    (audio) => void transcribe(audio),
    fail,
    (level) => waveformRef.current?.style.setProperty("--level", String(Math.min(1.22, 0.35 + level * 6))),
  );

  const capturing = recording.state !== "idle";
  const busy = status === "transcribing";
  const blocked = disabled || busy;

  function toggle() {
    if (capturing) {
      recording.cancel();
      return;
    }
    setError("");
    setStatus("idle");
    void recording.start();
  }

  const message = recording.state === "requesting" ? "マイクを準備中"
    : recording.state === "recording" ? "録音中"
    : status === "transcribing" ? "文字起こし中"
    : "";

  return <div className="voice-input">
    <section className="capture-bar" aria-label={label}>
      <span className="waveform" ref={waveformRef} data-active={recording.state === "recording"} aria-hidden="true">
        {[4, 8, 15, 10, 20, 12, 7].map((height, index) => <i key={index} style={{ height }} />)}
      </span>
      <div className="transcript" aria-live="polite">
        {recording.state === "recording" ? label : message || label}
      </div>
      <button type="button" className="record-button" data-recording={capturing} disabled={blocked} onClick={toggle}>
        <span className="mic" aria-hidden="true" />
        {capturing ? "録音を取り消す" : "録音開始"}
      </button>
    </section>
    {error && <div className="error-banner" role="alert"><span>{error}</span></div>}
  </div>;
}
