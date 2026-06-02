/**
 * bakass-chat — Cloudflare Worker
 *
 * RAG endpoint over the CV:
 *   1. Receive { query: string } from the static site.
 *   2. Lexical retrieval (BM25-lite) over CV_CHUNKS → top-k context.
 *   3. Build a system prompt grounding the LLM in those chunks.
 *   4. Call Anthropic's Messages API, return { answer, sources }.
 *
 * Why BM25-lite instead of embeddings?
 *   The CV corpus is tiny (~10 chunks, ~2k tokens). A full embedding
 *   pipeline adds cost + cold-start latency for negligible quality gain
 *   at this scale. We use Lucene-style scoring (term frequency * IDF)
 *   which is deterministic, free, and fast.
 *
 * Secrets:
 *   ANTHROPIC_API_KEY — wrangler secret put ANTHROPIC_API_KEY
 */

import { CV_CHUNKS, type Chunk } from "./cv-chunks";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  MODEL: string;
  MAX_TOKENS: string;
}

interface ChatRequest {
  query: string;
}

interface ChatResponse {
  answer: string;
  sources: string[];
}

// --------------------------------------------------------------------------
// Retrieval (BM25-lite)
// --------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "in", "on", "at", "to", "of", "for", "with", "by", "from",
  "his", "her", "he", "she", "it", "they", "them", "this", "that",
  "and", "or", "but", "if", "as", "what", "which", "who", "whom",
  "have", "has", "had", "do", "does", "did", "can", "could", "would",
  "i", "me", "my", "you", "your", "we", "us", "our",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Score each chunk against the query; return top-k. */
function retrieve(query: string, chunks: Chunk[], k: number = 3): Chunk[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return chunks.slice(0, k);

  // Inverse document frequency per query term
  const N = chunks.length;
  const idf = new Map<string, number>();
  for (const tok of qTokens) {
    const df = chunks.filter((c) => tokenize(c.text).includes(tok)).length;
    idf.set(tok, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  const scored = chunks.map((c) => {
    const cTokens = tokenize(c.text + " " + c.section);
    const len = cTokens.length;
    let score = 0;
    for (const tok of qTokens) {
      const tf = cTokens.filter((t) => t === tok).length;
      if (tf === 0) continue;
      // Simplified BM25: tf-saturated + length normalisation
      const k1 = 1.2;
      const b = 0.75;
      const avgLen = 50;
      const norm = 1 - b + b * (len / avgLen);
      score += (idf.get(tok) ?? 0) * ((tf * (k1 + 1)) / (tf + k1 * norm));
    }
    return { chunk: c, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((s) => s.score > 0)
    .map((s) => s.chunk);
}

// --------------------------------------------------------------------------
// LLM call
// --------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an assistant that answers questions about Ismail Bakass based ONLY on the CV excerpts provided below. 

Rules:
- Be concise — 1-3 sentences for most answers.
- If the CV doesn't contain the answer, say so plainly. Don't invent details.
- Speak about Ismail in the third person ("he has built...", "his stack includes...").
- Focus on technical depth when relevant.

CV EXCERPTS:
{context}`;

async function askLLM(env: Env, query: string, context: Chunk[]): Promise<string> {
  const ctx = context
    .map((c, i) => `[${i + 1}] (${c.section}) ${c.text}`)
    .join("\n");
  const system = SYSTEM_PROMPT.replace("{context}", ctx);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: parseInt(env.MAX_TOKENS, 10),
      system,
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
  return textBlocks.join("\n").trim();
}

// --------------------------------------------------------------------------
// HTTP handler
// --------------------------------------------------------------------------

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || "*";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body: ChatRequest;
    try {
      body = (await request.json()) as ChatRequest;
    } catch {
      return json({ error: "invalid JSON" }, 400, origin);
    }

    const query = (body.query ?? "").trim();
    if (!query || query.length > 500) {
      return json({ error: "query must be 1-500 chars" }, 400, origin);
    }

    try {
      const top = retrieve(query, CV_CHUNKS, 3);
      const answer = await askLLM(env, query, top);

      const payload: ChatResponse = {
        answer,
        sources: top.map((c) => c.section),
      };
      return json(payload, 200, origin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return json({ error: msg }, 500, origin);
    }
  },
};

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
