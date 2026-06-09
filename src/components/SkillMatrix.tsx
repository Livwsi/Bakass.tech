/**
 * SkillMatrix.tsx
 *
 * Interactive capability matrix spanning hardware/embedded and AI/ML/software.
 * - Filter by domain (All / Hardware / AI-ML / Software & Data).
 * - Each row: capability, domain tag, proficiency bar, key tools.
 * - Rows animate in/out on filter; bars animate on mount.
 */

import { useState } from "react";

type Domain = "Hardware" | "AI/ML" | "Software/Data";

interface Skill { name: string; domain: Domain; level: number; tools: string[]; }

const SKILLS: Skill[] = [
  // AI / ML
  { name: "LLM apps, RAG & agents", domain: "AI/ML", level: 84, tools: ["DeepSeek", "OpenAI/Anthropic APIs", "n8n"] },
  { name: "Deep learning", domain: "AI/ML", level: 85, tools: ["PyTorch", "TensorFlow", "CNNs"] },
  { name: "Computer vision", domain: "AI/ML", level: 82, tools: ["OpenCV", "MediaPipe", "TF.js"] },
  { name: "TinyML / edge inference", domain: "AI/ML", level: 82, tools: ["TFLite Micro", "quantization"] },
  { name: "Classical ML / DS", domain: "AI/ML", level: 83, tools: ["scikit-learn", "pandas", "stats"] },
  { name: "MLOps / experiment tracking", domain: "AI/ML", level: 78, tools: ["MLflow", "Docker", "CI/CD"] },
  // Software / data
  { name: "Data engineering & ETL", domain: "Software/Data", level: 80, tools: ["SQL", "PySpark", "Pydantic"] },
  { name: "Backend & APIs", domain: "Software/Data", level: 82, tools: ["Python", "FastAPI", "TypeScript"] },
  { name: "Workflow automation", domain: "Software/Data", level: 81, tools: ["n8n", "GitHub Actions", "Power Automate"] },
  { name: "Data visualization", domain: "Software/Data", level: 80, tools: ["Power BI", "D3.js", "Matplotlib"] },
  // Hardware / embedded
  { name: "Embedded firmware (C/C++)", domain: "Hardware", level: 85, tools: ["ESP32", "STM32", "FreeRTOS"] },
  { name: "Automated test systems", domain: "Hardware", level: 84, tools: ["LabVIEW", "TestStand", "Python"] },
  { name: "PCB design & layout", domain: "Hardware", level: 80, tools: ["Altium", "KiCad", "DFM"] },
  { name: "Analog & sensor design", domain: "Hardware", level: 82, tools: ["lock-in", "IMU", "DSP"] },
];

const FILTERS: ("All" | Domain)[] = ["All", "Hardware", "AI/ML", "Software/Data"];

const DOMAIN_COLOR: Record<Domain, string> = {
  "Hardware": "#0E6E63",
  "AI/ML": "#0DBE94",
  "Software/Data": "#2FD3C0",
};

export default function SkillMatrix() {
  const [filter, setFilter] = useState<"All" | Domain>("All");
  const rows = SKILLS.filter((s) => filter === "All" || s.domain === filter);

  return (
    <div className="sm">
      <div className="sm-filters">
        {FILTERS.map((f) => (
          <button key={f} className={`sm-f ${f === filter ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f}
            {f !== "All" && <span className="dot" style={{ background: DOMAIN_COLOR[f] }} />}
          </button>
        ))}
      </div>

      <div className="sm-table">
        {rows.map((s) => (
          <div className="sm-row" key={s.name}>
            <div className="sm-name">
              <span className="sm-dot" style={{ background: DOMAIN_COLOR[s.domain] }} />
              {s.name}
            </div>
            <div className="sm-bar">
              <span style={{ width: `${s.level}%`, background: DOMAIN_COLOR[s.domain] }} />
            </div>
            <div className="sm-tools">
              {s.tools.map((t) => <span className="sm-tool" key={t}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .sm { border-top: 1px solid var(--line-2); margin-top: 46px; }
        .sm-filters { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
        .sm-f { font-family: var(--mono); font-size: 13px; padding: 14px 20px; background: var(--cream); border: none; border-right: 1px solid var(--line); color: var(--ink-soft); cursor: pointer; transition: all .2s; display: flex; align-items: center; gap: 8px; }
        .sm-f:hover { background: var(--cream-2); color: var(--ink); }
        .sm-f.active { background: var(--ink); color: var(--cream); }
        .sm-f .dot { width: 7px; height: 7px; border-radius: 50%; }
        .sm-table { display: flex; flex-direction: column; }
        .sm-row { display: grid; grid-template-columns: 1.3fr 1fr 1.2fr; align-items: center; gap: 20px; padding: 16px 32px; border-bottom: 1px solid var(--line); animation: fade .4s ease both; }
        .sm-name { font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 10px; }
        .sm-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .sm-bar { height: 7px; background: var(--cream-2); border-radius: var(--r); overflow: hidden; }
        .sm-bar span { display: block; height: 100%; border-radius: var(--r); transition: width 1s cubic-bezier(.2,.8,.2,1); }
        .sm-tools { display: flex; gap: 6px; flex-wrap: wrap; }
        .sm-tool { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); border: 1px solid var(--line); padding: 3px 8px; border-radius: var(--r); }
        @media (max-width: 760px) {
          .sm-row { grid-template-columns: 1fr; gap: 10px; }
          .sm-bar { max-width: 200px; }
        }
      `}</style>
    </div>
  );
}
