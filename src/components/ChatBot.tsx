/**
 * ChatBot.tsx
 *
 * RAG-grounded CV Q&A.
 *
 * Two modes:
 *  1. PROD , POSTs to a Cloudflare Worker (holds the LLM key, does retrieval).
 *             Enabled when PUBLIC_CHAT_API is set at build time.
 *  2. LOCAL, built-in keyword responder over CV facts. Used in dev or when
 *             the worker is unreachable, so the demo is never dead.
 */

import { useEffect, useRef, useState } from "react";

interface Message { role: "user" | "assistant"; content: string; }

const WORKER_URL = import.meta.env.PUBLIC_CHAT_API ?? "";

const SUGGESTED = [
  "What's his experience with computer vision?",
  "Has he deployed models to production?",
  "What's his stack?",
  "Why switch from electronics?",
];

// ---- local fallback knowledge base ----
const KB: { k: string[]; a: string }[] = [
  { k: ["system", "build", "intelligent", "automation", "automate", "pipeline", "end to end", "end-to-end"],
    a: "He builds intelligent systems end to end: data ingestion and ETL, model training and evaluation, then deployment as automated, monitored services. The goal is always a system that runs reliably in production, not a notebook that works once." },
  { k: ["computer vision", "cv", "vision", "gesture", "image", "detection"],
    a: "He builds computer-vision systems: real-time hand-gesture recognition with MediaPipe, object detection, and CNNs trained from scratch for image classification (the handwriting model here hits 98% test accuracy, running fully in your browser)." },
  { k: ["production", "deploy", "deployed", "mlops", "serve", "ci", "cd"],
    a: "He can take models to production end to end: training pipelines, MLflow experiment tracking, FastAPI serving, Docker packaging, CI/CD on GitHub Actions, cloud deployment, plus logging and monitoring so things stay stable." },
  { k: ["stack", "tools", "technologies", "language", "skills", "know"],
    a: "ML/AI: Python, PyTorch, TensorFlow/TF.js, scikit-learn. Data: SQL, Power BI, ETL pipelines, pandas. Systems: TypeScript, FastAPI, Docker, CI/CD, Azure. He also has a strong hardware/embedded foundation." },
  { k: ["electronics", "hardware", "embedded", "switch", "background", "tinyml", "edge"],
    a: "His foundation is high-tech electronics, embedded firmware, sensors, low-power and analog design. That systems intuition is an asset for edge AI and TinyML, bridging models and the devices they run on." },
  { k: ["data", "analytics", "powerbi", "power bi", "etl", "sql"],
    a: "On the data side he works across the pipeline: ingestion and ETL, SQL, exploratory data analysis, dashboards in Power BI, and visualization with D3." },
  { k: ["volunteer", "volunteering", "board", "treasurer", "community", "social"],
    a: "Alongside engineering he stays active in the community: board treasurer of a photography association, board member for PR in the Fontys PROUD honours program, and volunteer work with VluchtelingenWerk Nederland and Stichting Vluchtelingen In De Knel supporting refugees." },
  { k: ["learn", "passion", "passionate", "motivat", "curious"],
    a: "He's genuinely passionate about technology and learning, and curious by default. He builds side projects (like this site) to go deeper into ML, data, and systems engineering." },
];

function localAnswer(q: string): string {
  const t = q.toLowerCase();
  for (const e of KB) if (e.k.some((k) => t.includes(k))) return e.a;
  return "Ask about how he builds intelligent systems, his ML and computer-vision work, data and automation pipelines, production/MLOps, his electronics background, or his volunteering. Try one of those.";
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi, I'm grounded in Ismail's CV. Ask about his ML projects, computer vision work, deployment experience, or background." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(query: string) {
    const q = query.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);

    // Simulate latency for the local path so the typing indicator reads naturally
    const reply = await getReply(q);
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
    setLoading(false);
  }

  async function getReply(q: string): Promise<string> {
    // No worker configured → local mode
    if (!WORKER_URL) {
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      return localAnswer(q);
    }
    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(`Worker ${res.status}`);
      const data = (await res.json()) as { answer: string };
      return data.answer;
    } catch {
      // Graceful degradation, fall back to local KB
      await new Promise((r) => setTimeout(r, 400));
      return localAnswer(q);
    }
  }

  return (
    <div className="chat-box">
      <div className="chat-head">
        <span className="live" />
        bakass-cv-assistant · {WORKER_URL ? "RAG" : "local"} · online
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>{m.content}</div>
        ))}
        {loading && <div className="typing"><span /><span /><span /></div>}
      </div>

      {messages.length <= 1 && (
        <div className="suggestions">
          {SUGGESTED.map((s) => (
            <button key={s} className="sugg" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about my skills, projects, experience…"
          disabled={loading}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}>Send</button>
      </div>

      <style>{`
        .chat-box { background: var(--ink); display: flex; flex-direction: column; min-height: 480px; }
        .chat-head { padding: 16px 22px; border-bottom: 1px solid var(--ink-line); display: flex; align-items: center; gap: 10px; color: var(--cream); font-family: var(--mono); font-size: 12px; }
        .chat-head .live { width: 8px; height: 8px; border-radius: 50%; background: var(--c2); box-shadow: 0 0 0 3px rgba(13,190,148,.25); }
        .chat-body { flex: 1; padding: 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; max-height: 420px; }
        .msg { max-width: 80%; padding: 12px 15px; border-radius: 10px; font-size: 14px; line-height: 1.5; }
        .msg.bot { background: rgba(255,255,255,.07); color: var(--cream); align-self: flex-start; border-radius: 10px 10px 10px 2px; }
        .msg.user { background: var(--flame-v); color: #04221d; font-weight: 500; align-self: flex-end; border-radius: 10px 10px 2px 10px; }
        .typing { display: flex; gap: 4px; align-self: flex-start; padding: 14px 16px; background: rgba(255,255,255,.07); border-radius: 10px; }
        .typing span { width: 7px; height: 7px; border-radius: 50%; background: rgba(247,249,249,.5); animation: blink 1.4s infinite both; }
        .typing span:nth-child(2){ animation-delay:.2s } .typing span:nth-child(3){ animation-delay:.4s }
        .suggestions { padding: 0 22px 14px; display: flex; gap: 6px; flex-wrap: wrap; }
        .sugg { font-family: var(--mono); font-size: 11px; color: rgba(247,249,249,.7); background: transparent; border: 1px solid var(--ink-line); padding: 5px 10px; border-radius: var(--r); cursor: pointer; transition: all .2s; }
        .sugg:hover { background: rgba(255,255,255,.05); color: var(--cream); }
        .chat-input { border-top: 1px solid var(--ink-line); padding: 14px 18px; display: flex; gap: 10px; align-items: center; }
        .chat-input input { flex: 1; background: rgba(255,255,255,.06); border: 1px solid var(--ink-line); border-radius: var(--r); padding: 11px 14px; color: var(--cream); font-family: var(--font); font-size: 14px; outline: none; }
        .chat-input input::placeholder { color: rgba(247,249,249,.4); }
        .chat-input input:focus { border-color: var(--c2); }
        .chat-input button { background: var(--flame-v); border: none; color: #04221d; font-weight: 600; padding: 11px 18px; border-radius: var(--r); cursor: pointer; font-family: var(--font); }
        .chat-input button:disabled { opacity: .4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
