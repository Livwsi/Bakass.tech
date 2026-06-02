/**
 * ObjectDemo.tsx
 *
 * Real-time object detection (COCO-SSD, 80 classes), fully client-side.
 *
 * IMPORTANT: we load TF.js + COCO-SSD from CDN at runtime rather than
 * bundling them. Bundling @tensorflow-models/coco-ssd through Vite pulls
 * in node-only deps (node-fetch → whatwg-url) that break the browser build
 * ("does not provide an export named 'default'"). CDN globals sidestep this.
 */

import { useEffect, useRef, useState } from "react";

// Minimal typings for the CDN globals
interface DetectedObject { bbox: [number, number, number, number]; class: string; score: number; }
interface CocoModel { detect: (el: HTMLVideoElement) => Promise<DetectedObject[]>; }
declare global {
  interface Window {
    tf?: unknown;
    cocoSsd?: { load: (cfg?: { base?: string }) => Promise<CocoModel> };
  }
}

const TF_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const COCO_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export default function ObjectDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<CocoModel | null>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const detRef = useRef<DetectedObject[]>([]);

  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [count, setCount] = useState(0);
  const [fps, setFps] = useState(0);

  async function start() {
    setStatus("loading"); setErrMsg("");
    try {
      // Load CDN globals in order (tf first, then coco-ssd)
      await loadScript(TF_CDN);
      await loadScript(COCO_CDN);
      if (!window.cocoSsd) throw new Error("coco-ssd global missing");

      modelRef.current = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setStatus("running");
      loop();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "unknown error");
      setStatus("error");
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    modelRef.current = null;
    setStatus("idle");
  }

  function loop() {
    const video = videoRef.current, canvas = canvasRef.current, model = modelRef.current;
    if (!video || !canvas || !model) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let lastTs = performance.now();

    const tick = async () => {
      if (!videoRef.current || !modelRef.current) return;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      frameRef.current++;
      if (frameRef.current % 3 === 0) {
        const preds = (await modelRef.current.detect(video)).filter((p) => p.score > 0.5);
        detRef.current = preds;
        setCount(preds.length);
        const now = performance.now();
        setFps(Math.round(1000 / (now - lastTs))); lastTs = now;
      }

      ctx.lineWidth = 2; ctx.font = "12px JetBrains Mono, monospace";
      for (const d of detRef.current) {
        const [x, y, w, h] = d.bbox;
        ctx.strokeStyle = "#2FD3C0"; ctx.strokeRect(x, y, w, h);
        const label = `${d.class} ${d.score.toFixed(2)}`;
        const m = ctx.measureText(label);
        ctx.fillStyle = "#0DBE94"; ctx.fillRect(x, y - 18, m.width + 8, 16);
        ctx.fillStyle = "#04221d"; ctx.fillText(label, x + 4, y - 6);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  useEffect(() => () => stop(), []);

  return (
    <div className="demo-box">
      <div className="glow" />
      <h3>Object detection</h3>
      <div className="mono">coco-ssd · 80 classes · WebGL</div>
      <div className="stage">
        <video ref={videoRef} muted playsInline style={{ display: "none" }} />
        <canvas ref={canvasRef} className={status === "running" ? "live" : ""} />
        {status === "idle" && <button className="enable" onClick={start}>📹 enable webcam</button>}
        {status === "loading" && <span className="mono dim">loading coco-ssd…</span>}
        {status === "error" && <span className="mono dim">⚠ {errMsg}</span>}
      </div>
      <div className="pred">
        <span className="big">{count}</span>
        <div className="bar"><span style={{ width: `${Math.min(count * 20, 100)}%` }} /></div>
      </div>
      <div className="demo-foot">{count} objects · {fps} fps</div>
    </div>
  );
}
