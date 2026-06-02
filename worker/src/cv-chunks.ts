/**
 * cv-chunks.ts
 *
 * The CV broken into semantic chunks. At deploy-time each chunk is embedded
 * (see embed-cv.ts script in this folder), and the resulting vectors are
 * baked into a static module imported by the worker. For now, we ship the
 * raw text and rely on lexical (BM25-lite) retrieval — good enough for a
 * ~50-chunk corpus and zero embedding API cost.
 *
 * EDIT THIS FILE with your actual CV content before deploying.
 */

export interface Chunk {
  id: string;
  section: string;
  text: string;
}

export const CV_CHUNKS: Chunk[] = [
  {
    id: "summary",
    section: "Profile",
    text: "Ismail Bakass — electronics engineer pivoting into ML/AI engineering. Based in Eindhoven, Netherlands. Strong systems background: edge hardware, embedded ML, PCB design, plus modern ML stack (PyTorch, TF.js, MLflow, CI/CD).",
  },
  {
    id: "exp-neways",
    section: "Experience",
    text: "Neways Electronics International — built end-to-end ML pipelines and deployed LLM systems in production. Stack: Python, FastAPI, Docker, Azure, SQL, MLflow, Power BI, LLM APIs.",
  },
  {
    id: "exp-vtec",
    section: "Experience",
    text: "VTEC Lasers & Sensors — embedded ML on IMU/PPG sensor data. Signal processing for biometrics, on-device inference, low-power constraints.",
  },
  {
    id: "thesis",
    section: "Education",
    text: "Graduation thesis: TinyML — running neural networks on microcontrollers. Deep hands-on with model quantization, hardware constraints, and edge deployment.",
  },
  {
    id: "skills-ml",
    section: "Skills",
    text: "ML / DS: Python, PyTorch, TensorFlow, TensorFlow.js, scikit-learn, pandas, MLflow. Computer vision (CNNs, MediaPipe). NLP and LLM apps (RAG, embeddings, prompt engineering).",
  },
  {
    id: "skills-systems",
    section: "Skills",
    text: "Systems / SWE: TypeScript, FastAPI, Docker, GitHub Actions for CI/CD, Cloudflare Workers (edge runtime), Azure, SQL, PostgreSQL. D3.js for data visualization.",
  },
  {
    id: "portfolio",
    section: "Portfolio",
    text: "bakass.tech — single-page portfolio with live in-browser ML: hand gesture recognition (MediaPipe), real-time object detection (COCO-SSD), MNIST handwriting CNN I trained myself, and a RAG chatbot powered by Cloudflare Workers + an LLM.",
  },
  {
    id: "open-source",
    section: "Open source",
    text: "Maintainer of pyfunda (Python wrapper for the Funda mobile API). Active GitHub at github.com/0xMH.",
  },
  {
    id: "deployment",
    section: "Production experience",
    text: "Yes — has deployed ML models to production at Neways Electronics International. End-to-end ownership: training pipeline, MLflow experiment tracking, FastAPI serving, Docker packaging, Azure deployment, monitoring.",
  },
];
