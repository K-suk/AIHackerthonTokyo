"use client";

import { useEffect, useRef, useState } from "react";

type Capture = {
  active: boolean;
  stop?: (submit: boolean) => void;
};

const formats = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
const endSilenceMs = 3800;
const recordingLimitMs = 90_000;

export function useRecording(
  onAudio: (audio: Blob) => void,
  onError: (message: string) => void,
  onLevel: (level: number) => void,
) {
  const capture = useRef<Capture | null>(null);
  const [state, setState] = useState<"idle" | "requesting" | "recording">("idle");

  useEffect(() => {
    return () => {
      const current = capture.current;
      if (!current) return;
      current.active = false;
      current.stop?.(false);
    };
  }, []);

  function cancel() {
    const current = capture.current;
    if (!current) return;
    current.active = false;
    current.stop?.(false);
    capture.current = null;
    setState("idle");
  }

  async function start() {
    if (capture.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext) {
      onError("このブラウザでは録音できません。HTTPSまたはlocalhostのChrome・Safariをお試しください。");
      return;
    }

    const attempt: Capture = { active: true };
    capture.current = attempt;
    setState("requesting");

    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame = 0;
    function release() {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {});
    }

    try {
      context = new AudioContext();
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!attempt.active) {
        release();
        return;
      }

      const mimeType = formats.find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);

      const chunks: Blob[] = [];
      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let voiceFrames = 0;
      let lastAudibleAt = startedAt;
      let speechStarted = false;
      let submit = false;
      let stopped = false;

      function stop(shouldSubmit: boolean) {
        if (stopped) return;
        stopped = true;
        submit = shouldSubmit;
        cancelAnimationFrame(frame);
        if (recorder.state !== "inactive") recorder.stop();
        else release();
      }
      attempt.stop = stop;

      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.onstop = () => {
        release();
        onLevel(0);
        if (!attempt.active) return;
        attempt.active = false;
        capture.current = null;
        setState("idle");
        if (!submit) return;
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type });
        if (audio.size) onAudio(audio);
        else onError("録音を読み取れませんでした。もう一度お試しください。");
      };
      recorder.onerror = () => {
        if (attempt.active) onError("録音が途中で止まりました。もう一度お試しください。");
        stop(false);
      };

      function detect(now: number) {
        analyser.getFloatTimeDomainData(samples);
        const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
        const level = Math.sqrt(meanSquare);
        onLevel(level);
        const audible = level > 0.018;
        if (audible) {
          voiceFrames += 1;
          if (voiceFrames >= 4) speechStarted = true;
          if (speechStarted) lastAudibleAt = now;
        } else {
          voiceFrames = 0;
        }

        if (speechStarted && (now - lastAudibleAt >= endSilenceMs || now - startedAt >= recordingLimitMs)) {
          stop(true);
        } else if (!speechStarted && now - startedAt >= 12_000) {
          stop(false);
          onError("声を検出できませんでした。マイクに近づいて再度お試しください。");
        } else {
          frame = requestAnimationFrame(detect);
        }
      }

      recorder.start();
      setState("recording");
      frame = requestAnimationFrame(detect);
    } catch (error) {
      release();
      if (!attempt.active) return;
      attempt.active = false;
      capture.current = null;
      setState("idle");
      onError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "ブラウザでマイクの使用を許可してください。"
        : "マイクを開始できませんでした。接続を確認してください。");
    }
  }

  function finish() {
    capture.current?.stop?.(true);
  }

  return { state, start, finish, cancel };
}
