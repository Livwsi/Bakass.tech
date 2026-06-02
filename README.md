# bakass.tech

Single-page portfolio proving end-to-end **AI / ML / Computer Vision / Data Science**
capability — every section is a working live demo, not a description.

→ Live at [bakass.tech](https://bakass.tech)

---

## What this repo demonstrates

| Discipline           | Where it lives                                                     |
| -------------------- | ------------------------------------------------------------------ |
| **AI / LLM**         | RAG chatbot grounded in CV (BM25-lite retrieval + Anthropic API)   |
| **Computer Vision**  | MediaPipe HandLandmarker, COCO-SSD, MNIST CNN — all in-browser     |
| **Classical ML**     | Keras CNN trained with MLflow tracking, exported to TF.js          |
| **Data Science**     | ETL pipeline (OWID → pandas → Pydantic-validated JSON → D3 chart)  |
| **MLOps**            | MLflow experiment tracking, reproducible training, model registry  |
| **CI/CD**            | GitHub Actions: build/deploy + scheduled ETL refresh + PR typecheck|
| **Edge compute**     | Cloudflare Worker proxies LLM calls; static origin never sees keys |

---

## System architecture

```
                          ┌─────────────────────────────────┐
                          │   GitHub repo (main branch)     │
                          └────────────────┬────────────────┘
                                           │
        ┌──────────────────────────────────┼──────────────────────────────────┐
        │                                  │                                  │
   ┌────▼──────┐                  ┌────────▼─────────┐               ┌────────▼────────┐
   │ deploy.yml│                  │ refresh-data.yml │               │     ci.yml      │
   │ on: push  │                  │ on: cron (weekly)│               │  on: pull_req   │
   └────┬──────┘                  └────────┬─────────┘               └────────┬────────┘
        │ npm build                        │ python fetch_owid.py             │ typecheck
        │ astro → dist/                    │ → commits JSON                   │ + build
        ▼                                  │                                  ▼
   ┌─────────────────┐                     │                            (gate merges)
   │ GitHub Pages    │◀────────────────────┘
   │ bakass.tech     │                     ETL re-runs deploy
   └────────┬────────┘
            │  static HTML/JS/CSS + model weights + JSON
            │
            ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                          Visitor's browser                           │
   │                                                                      │
   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
   │  │ Hand       │  │ Object     │  │ MNIST CNN  │  │ Co₂ chart      │  │
   │  │ landmarks  │  │ detection  │  │ inference  │  │ (D3.js)        │  │
   │  │ (MediaPipe)│  │ (COCO-SSD) │  │ (TF.js)    │  │                │  │
   │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │
   │                                                                      │
   │             ┌────────────────┐                                       │
   │             │ ChatBot island │ ─POST─▶  Cloudflare Worker            │
   │             └────────────────┘             │                         │
   │                                            │ retrieve top-k chunks   │
   │                                            ▼                         │
   │                                       Anthropic API (LLM)            │
   │                                            │                         │
   │                                       ◀──── grounded answer          │
   └──────────────────────────────────────────────────────────────────────┘
```

### Why static + edge-functions

GitHub Pages is static-only — no Python/Node runtime. The site is built once,
served from CDN. Two patterns extend it:

1. **GitHub Actions as a data backend**
   The OWID pipeline runs on cron, writes JSON into `public/data/`, commits
   back to `main`. Pages auto-redeploys. The "backend" is just CI.

2. **Cloudflare Worker for secrets**
   The chatbot needs an API key. We never embed it in client code — instead a
   tiny Worker (free tier, <1ms cold start) proxies the LLM call. The Worker
   holds the secret, the static origin only knows the public Worker URL.

---

## Tech stack

| Layer            | Choice                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Site framework   | **Astro 4** (static output, React islands for interactivity)       |
| Languages        | **TypeScript** (everywhere) + **Python** (offline ML & ETL)        |
| Styling          | Plain CSS with design tokens (no framework)                        |
| Charts           | **D3.js v7** (custom SVG)                                          |
| Client ML        | **TensorFlow.js**, **COCO-SSD**, **MediaPipe Tasks Vision**         |
| Model training   | **Keras** (TF 2.16) + **MLflow** tracking, export to TF.js Layers  |
| Data pipeline    | **pandas**, **Pydantic** (schema validation at I/O boundary)       |
| Chatbot backend  | **Cloudflare Workers** (edge runtime, V8 isolates)                 |
| LLM              | Anthropic Claude (Haiku — fast + cheap)                            |
| Retrieval        | BM25-lite over CV chunks — deterministic, zero embedding cost      |
| Hosting          | **GitHub Pages** + Cloudflare Worker (separate deploy)             |
| CI/CD            | **GitHub Actions** — 3 workflows: deploy, ci, refresh-data         |

---

## Repository layout

```
.
├── public/                     # static assets served as-is
│   ├── models/mnist/           # trained TF.js model (committed)
│   ├── data/nl_co2.json        # ETL output (committed by CI)
│   ├── cv/                     # CV PDF
│   ├── CNAME                   # → bakass.tech
│   └── favicon.svg
│
├── src/
│   ├── styles/tokens.css       # design system (single source of truth)
│   ├── layouts/Base.astro      # <head>, scroll-reveal, fonts
│   ├── components/
│   │   ├── Nav.astro           ┐
│   │   ├── Hero.astro          │  Astro static partials
│   │   ├── SkillBar.astro      │
│   │   ├── SectionHead.astro   │
│   │   ├── Footer.astro        ┘
│   │   ├── ChatBot.tsx         ┐
│   │   ├── GestureDemo.tsx     │  React islands (hydrated on visible)
│   │   ├── ObjectDemo.tsx      │
│   │   ├── DigitDemo.tsx       │
│   │   └── Co2Chart.tsx        ┘
│   └── pages/index.astro       # assembles the single page
│
├── ml/                         # offline ML — Python
│   ├── train_mnist.py          # train CNN, log to MLflow, export TF.js
│   ├── requirements.txt
│   └── README.md
│
├── pipeline/                   # ETL — Python
│   ├── fetch_owid.py           # OWID → pandas → Pydantic → JSON
│   └── requirements.txt
│
├── worker/                     # Cloudflare Worker — TypeScript
│   ├── src/
│   │   ├── index.ts            # RAG retrieval + LLM proxy
│   │   └── cv-chunks.ts        # CV text broken into chunks
│   ├── wrangler.toml
│   ├── tsconfig.json
│   └── package.json
│
├── .github/workflows/
│   ├── deploy.yml              # main → Pages
│   ├── ci.yml                  # PR typecheck + build smoke test
│   └── refresh-data.yml        # weekly OWID refresh
│
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

---

## Getting started

### Prereqs
- Node 20+ (see `.nvmrc`)
- Python 3.11+
- npm (or pnpm)

### Local dev

```bash
npm ci
npm run dev          # http://localhost:4321
```

### Train the MNIST model (one-time, before deploying)

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train_mnist.py
# → writes ../public/models/mnist/model.json + shards
# → MLflow runs logged to ./mlruns/
mlflow ui            # browse runs at http://localhost:5000
```

### Refresh OWID data locally

```bash
cd pipeline
pip install -r requirements.txt
python fetch_owid.py
# → writes ../public/data/nl_co2.json
```

### Deploy the chatbot Worker

```bash
cd worker
npm i
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste the key
npx wrangler deploy
# → note the worker URL (e.g. https://bakass-chat.your-subdomain.workers.dev)
```

Then point the site at it:
```bash
# in the repo root, .env or build env:
PUBLIC_CHAT_API=https://bakass-chat.your-subdomain.workers.dev/chat
```

### Deploy the site
1. Push to `main`.
2. In repo Settings → Pages → Source: **GitHub Actions**.
3. `deploy.yml` builds and publishes automatically.
4. DNS: point `bakass.tech` A records at GitHub Pages IPs + CNAME `www`.

---

## Engineering choices worth noting

- **Typed everywhere.** Strict TS in the worker, strict Astro config. Python uses
  Pydantic for schema validation at the network/file boundary.

- **Reproducibility.** Training seeded across Python/NumPy/TF. Dependencies pinned.
  MLflow logs every run so any model artifact can be traced back to a git SHA + params.

- **Lazy-loading.** TF.js, MediaPipe, COCO-SSD are heavy. React islands hydrate on
  `client:visible`, and the model imports are dynamic — nothing loads until the
  user scrolls to that demo.

- **CSP-friendly.** No inline event handlers. Worker scoped to one origin via
  `ALLOWED_ORIGIN`. CORS preflight handled.

- **Zero secrets in client code.** API keys live in Cloudflare Worker secrets.
  The static site only knows public Worker URLs.

---

## License

Code: MIT.
Data: OWID datasets under CC-BY 4.0 (Our World in Data).
