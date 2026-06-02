/**
 * GestureDemo.tsx
 *
 * Hand gesture recognition entirely client-side.
 * - Loads MediaPipe HandLandmarker (WASM + WebGL backend).
 * - 21 landmark keypoints extracted per hand per frame.
 * - A small rule-based classifier maps landmark geometry to gestures
 *   (open palm, fist, peace, thumbs-up, point). Trivially replaceable
 *   with a small MLP trained on landmarks if I want more classes.
 */

import { useEffect, useRef, useState } from "react";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";

// Landmark indices (MediaPipe Hands spec)
const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 } as const;
const PIPS = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 } as const;
const WRIST = 0;

type Landmark = { x: number; y: number; z: number };

/**
 * Rule-based gesture classifier from 21 hand landmarks.
 * Returns label + confidence proxy (count of cleanly-extended fingers vs total).
 */
function classify(lms: Landmark[]): { label: string; conf: number } {
  if (!lms || lms.length < 21) return { label: "—", conf: 0 };

  // A finger is "extended" when tip is further from wrist than its PIP joint.
  // Normalised against hand size for scale-invariance.
  const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = lms[WRIST];
  const ext = (tip: number, pip: number) => dist(lms[tip], w) > dist(lms[pip], w) * 1.05;

  const f = {
    thumb: ext(TIPS.thumb, PIPS.thumb),
    index: ext(TIPS.index, PIPS.index),
    middle: ext(TIPS.middle, PIPS.middle),
    ring: ext(TIPS.ring, PIPS.ring),
    pinky: ext(TIPS.pinky, PIPS.pinky),
  };
  const count = Object.values(f).filter(Boolean).length;

  let label = "unknown";
  if (count === 0) label = "✊ fist";
  else if (count === 5) label = "✋ open palm";
  else if (f.index && f.middle && !f.ring && !f.pinky) label = "✌️ peace";
  else if (f.thumb && !f.index && !f.middle && !f.ring && !f.pinky) label = "👍 thumbs up";
  else if (f.index && !f.middle && !f.ring && !f.pinky) label = "☝️ point";

  // Confidence proxy: how unambiguous the finger states are (5/5 = 1.0)
  const conf = 0.6 + Math.min(count, 5 - count) * 0.08;
  return { label, conf: Math.min(0.98, conf + 0.3) };
}

export default function GestureDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number>(0);

  const [status, setStatus] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [gesture, setGesture] = useState<{ label: string; conf: number }>({
    label: "—",
    conf: 0,
  });

  async function start() {
    setStatus("loading");
    setErrMsg("");
    try {
      // Lazy-load MediaPipe (large WASM, only fetch on demand)
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setStatus("running");
      loop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      setErrMsg(msg);
      setStatus("error");
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setStatus("idle");
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const lm = landmarkerRef.current;
    if (!video || !canvas || !lm) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!videoRef.current || !landmarkerRef.current) return;

      const ts = performance.now();
      const res: HandLandmarkerResult = lm.detectForVideo(video, ts);

      // Resize canvas to video aspect
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (res.landmarks?.length) {
        const lms = res.landmarks[0] as Landmark[];

        // Draw landmarks
        ctx.fillStyle = "#2FD3C0";
        for (const p of lms) {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Classify + render
        const out = classify(lms);
        setGesture(out);
      } else {
        setGesture({ label: "—", conf: 0 });
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  }

  // Clean up on unmount
  useEffect(() => () => stop(), []);

  return (
    <div className="demo-box">
      <div className="glow" />
      <h3>Hand gesture recognition</h3>
      <div className="mono">mediapipe · 21 landmarks · WebGL</div>

      <div className="stage">
        <video ref={videoRef} muted playsInline style={{ display: "none" }} />
        <canvas ref={canvasRef} className={status === "running" ? "live" : ""} />
        {status === "idle" && <button className="enable" onClick={start}>✋ enable webcam</button>}
        {status === "loading" && <span className="mono dim">loading model…</span>}
        {status === "error" && <span className="mono dim">⚠ {errMsg}</span>}
      </div>

      <div className="pred">
        <span className="big">{gesture.label === "—" ? "—" : gesture.label.slice(0, 2)}</span>
        <div className="bar">
          <span style={{ width: `${gesture.conf * 100}%` }} />
        </div>
      </div>
      <div className="demo-foot">
        {gesture.label} · {gesture.conf.toFixed(2)} confidence
      </div>

      <DemoStyles />
    </div>
  );
}

// Shared styles for all 3 demo boxes, declared once, scoped via class names.
export function DemoStyles() {
  return (
    <style>{`
      .demo-box {
        padding: 28px;
        background: var(--ink);
        color: var(--cream);
        position: relative;
        overflow: hidden;
        border-right: 1px solid var(--ink-line);
      }
      .demo-box:last-child { border-right: none; }
      .demo-box .glow {
        position: absolute;
        bottom: -40%; right: -25%;
        width: 260px; height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(13, 190, 148, 0.4), transparent 70%);
        filter: blur(10px);
      }
      .demo-box h3 { position: relative; font-size: 17px; margin-bottom: 4px; }
      .demo-box .mono {
        position: relative;
        font-family: var(--mono);
        font-size: 11px;
        color: rgba(247, 249, 249, 0.5);
        margin-bottom: 16px;
      }
      .demo-box .stage {
        position: relative;
        background: rgba(255, 255, 255, 0.05);
        border: 1px dashed rgba(247, 249, 249, 0.22);
        border-radius: var(--r);
        height: 200px;
        display: grid;
        place-items: center;
        overflow: hidden;
      }
      .demo-box .stage canvas { width: 100%; height: 100%; object-fit: cover; display: block; }
      .demo-box .stage canvas:not(.live) { display: none; }
      .demo-box .enable {
        background: var(--flame-v);
        border: none;
        color: #fff;
        font-weight: 600;
        padding: 10px 20px;
        border-radius: var(--r);
        cursor: pointer;
        font-family: var(--font);
        font-size: 13px;
      }
      .demo-box .dim { color: rgba(247, 249, 249, 0.5); }
      .demo-box .pred {
        position: relative;
        margin-top: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .demo-box .pred .big {
        font-size: 30px;
        font-weight: 700;
        background: var(--flame);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        min-width: 50px;
      }
      .demo-box .bar {
        flex: 1;
        height: 7px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: var(--r);
        overflow: hidden;
      }
      .demo-box .bar span {
        display: block;
        height: 100%;
        background: var(--flame);
        transition: width .2s;
      }
      .demo-box .demo-foot {
        position: relative;
        margin-top: 14px;
        font-family: var(--mono);
        font-size: 11px;
        color: rgba(247, 249, 249, 0.45);
      }
    `}</style>
  );
}
