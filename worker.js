const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ===============================
// 🎯 MAPEAMENTO DE TERMOS
// ===============================
const ACADEMIC_MAPPING = {
  autism: ["autism spectrum disorder", "ASD", "autism", "autistic"],
  speech: ["speech intervention", "language development", "speech therapy", "communication disorder"],
  communication: ["communication skills", "AAC", "social communication"],
  preschool: ["early childhood education", "preschool", "inclusive education"],
  intervention: ["evidence-based intervention", "behavioral intervention", "ABA"],
  interests: ["special interests", "restricted interests", "hyperfocus"],
  inclusion: ["inclusive education", "mainstreaming", "classroom integration"],
};

// ===============================
// 🔍 DETECÇÃO DE TÓPICOS
// ===============================
function detectTopics(question) {
  const q = question.toLowerCase();
  const detected = [];

  if (q.includes("tea") || q.includes("autismo") || q.includes("autista")) {
    detected.push("autism");
  }
  if (q.includes("falar") || q.includes("fala") || q.includes("comunicação")) {
    detected.push("speech", "communication");
  }
  if (q.includes("hiperfoco") || q.includes("interesse") || q.includes("fixação")) {
    detected.push("interests");
  }
  if (q.includes("inclusão") || q.includes("sala") || q.includes("turma")) {
    detected.push("inclusion", "preschool");
  }
  if (q.includes("ajudar") || q.includes("estratégia") || q.includes("como")) {
    detected.push("intervention");
  }

  if (detected.length < 2) {
    detected.push("autism", "intervention", "preschool");
  }

  return [...new Set(detected)];
}

// ===============================
// 🧠 CONSTRUIR QUERIES
// ===============================
function buildSearchQueries(question) {
  const topics = detectTopics(question);
  const queries = [];

  // Query principal
  const terms = [];
  for (const topic of topics) {
    if (ACADEMIC_MAPPING[topic]) {
      terms.push(...ACADEMIC_MAPPING[topic].slice(0, 3));
    }
  }
  if (terms.length > 0) {
    queries.push(terms.slice(0, 8).join(" OR "));
  }

  // Query específica para hiperfoco
  if (topics.includes("interests")) {
    queries.push("autism special interests intervention classroom");
  }

  // Query específica para inclusão
  if (topics.includes("inclusion")) {
    queries.push("autism inclusive education classroom strategies");
  }

  // Fallback genérico
  queries.push("autism classroom intervention early childhood");

  return queries;
}

// ===============================
// 🆕 BUSCA PUBMED.AI
// ===============================
async function searchPubMedAI(query, limit = 10) {
  if (!query) return [];

  try {
    const url = new URL("https://service.pubmed.ai/search");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));

    const resp = await fetch(url.toString());
    if (!resp.ok) return [];

    const data = await resp.json();
    const articles = data?.articles || [];

    return articles
      .filter((a) => a.abstract && a.abstract.length > 50)
      .map((a) => ({
        paperId: String(a.pmid || a.id || ""),
        title: (a.title || "").substring(0, 200),
        abstract: (a.abstract || "").substring(0, 500),
        year: String(a.year || ""),
        venue: a.journal || "",
        authors: (a.authors || []).map((name) => ({
          name: typeof name === "string" ? name : name.name || "Unknown",
        })),
        url: a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/` : "",
        source: "PubMed.ai",
      }));
  } catch (e) {
    console.error("PubMed.ai error:", e);
    return [];
  }
}

// ===============================
// 🔎 BUSCA CORE
// ===============================
async function searchCore(query, apiKey, limit = 10) {
  if (!query || !apiKey) return [];

  try {
    const url = new URL("https://api.core.ac.uk/v3/search/works");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    const results = data?.results || [];

    return results
      .filter((p) => p.abstract && p.abstract.length > 50)
      .map((p) => ({
        paperId: p.id || "",
        title: (p.title || "").substring(0, 200),
        abstract: String(p.abstract).substring(0, 500),
        year: String(p.yearPublished || ""),
        venue: p.journals?.[0]?.title || "",
        authors: (p.authors || []).map((a) => ({ name: a.name || a })),
        url: p.downloadUrl || "",
        source: "CORE",
      }))
      .slice(0, limit);
  } catch (e) {
    console.error("CORE error:", e);
    return [];
  }
}

// ===============================
// 📚 BUSCA DOAJ
// ===============================
async function searchDOAJ(query, limit = 10) {
  if (!query) return [];

  try {
    const url = new URL("https://doaj.org/api/search/articles/" + encodeURIComponent(query));
    url.searchParams.set("pageSize", String(limit));

    const resp = await fetch(url.toString());
    if (!resp.ok) return [];

    const data = await resp.json();
    const results = data?.results || [];

    return results
      .filter((p) => p.bibjson?.abstract)
      .map((p) => ({
        paperId: p.id || "",
        title: (p.bibjson?.title || "").substring(0, 200),
        abstract: String(p.bibjson?.abstract || "").substring(0, 500),
        year: String(p.bibjson?.year || ""),
        venue: p.bibjson?.journal?.title || "",
        authors: (p.bibjson?.author || []).map((a) => ({ name: a.name || "" })),
        url: p.bibjson?.link?.[0]?.url || "",
        source: "DOAJ",
      }));
  } catch (e) {
    console.error("DOAJ error:", e);
    return [];
  }
}

// ===============================
// 👩‍🔬 FORMATAÇÃO AUTORES
// ===============================
function formatAuthors(authors) {
  const names = (authors || []).map((a) => a?.name).filter(Boolean);
  if (!names.length) return "Autor desconhecido";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(" e ");
  return names.slice(0, 2).join(", ") + " et al.";
}

// ===============================
// 🔐 HASH
// ===============================
async function hashKey(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ===============================
// 📚 PROCESSAR PAPERS
// ===============================
function processPapers(papers, limit = 4) {
  const seen = new Set();
  const processed = [];

  for (const p of papers) {
    const key = (p.paperId || p.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!p.abstract || p.abstract.length < 30) continue;
    processed.push(p);
    if (processed.length >= limit) break;
  }

  return processed;
}

// ===============================
// 🚀 WORKER PRINCIPAL
// ===============================
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname !== "/chat" || req.method !== "POST") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    try {
      const { question } = await req.json();
      const q = String(question || "").trim();

      if (!q || q.length < 5) {
        return new Response(
          JSON.stringify({
            answer: "Por favor, faça uma pergunta mais específica sobre educação inclusiva e TEA.",
            refs: [],
          }),
          { headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Cache
      const cacheKey = "answer:" + (await hashKey(q));
      const cached = await env.INCLUI_CACHE.get(cacheKey);
      if (cached) {
        return new Response(cached, {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // ===============================
      // 🔎 BUSCA COM MÚLTIPLAS QUERIES
      // ===============================
      const queries = buildSearchQueries(q);
      let allPapers = [];

      for (const query of queries) {
        // Prioridade 1: PubMed.ai
        const pubmedAI = await searchPubMedAI(query, 8);
        allPapers.push(...pubmedAI);
        if (allPapers.length >= 4) break;

        // Prioridade 2: CORE
        if (env.CORE_API_KEY) {
          const core = await searchCore(query, env.CORE_API_KEY, 8);
          allPapers.push(...core);
        }
        if (allPapers.length >= 4) break;

        // Prioridade 3: DOAJ
        const doaj = await searchDOAJ(query, 6);
        allPapers.push(...doaj);
        if (allPapers.length >= 4) break;
      }

      const papers = processPapers(allPapers, 4);

      // ===============================
      // ❌ SEM RESULTADOS
      // ===============================
      if (papers.length === 0) {
        const fallback = JSON.stringify({
          answer:
            "Não encontrei estudos acadêmicos específicos. Tente reformular com mais detalhes: idade da criança, comportamento específico, ou contexto da situação.",
          refs: [],
        });

        await env.INCLUI_CACHE.put(cacheKey, fallback, { expirationTtl: 3600 });
        return new Response(fallback, {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // ===============================
      // 📖 MONTAR CONTEXTO
      // ===============================
      const refs = papers.map((p, i) => ({
        ref: `[${i + 1}]`,
        title: p.title,
        year: p.year || "s/d",
        venue: p.venue || "s/d",
        authors: formatAuthors(p.authors),
        url: p.url || "",
        source: p.source || "",
      }));

      const context = papers
        .map(
          (p, i) =>
            `[${i + 1}] ${formatAuthors(p.authors)} (${p.year || "s/d"}). ${p.title}
Resumo: ${p.abstract || "Sem resumo"}`
        )
        .join("\n\n");

      // ===============================
      // 🤖 PROMPT
      // ===============================
      const prompt = `Você é especialista em educação inclusiva e TEA. Responda em português brasileiro de forma PRÁTICA.

PERGUNTA:
${q}

ESTUDOS DISPONÍVEIS:
${context}

INSTRUÇÕES:
1. Dê 3-4 estratégias práticas baseadas APENAS nos estudos acima
2. Seja específico para sala de aula
3. Use linguagem simples e direta
4. Máximo 6 linhas
5. SEM asteriscos, hashtags ou formatação
6. Última linha: "Baseado em [1] [2]" (números dos estudos usados)

Resposta:`;

      // ===============================
      // 🧠 IA
      // ===============================
      const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.3,
      });

      let answer = String(aiResp.response || "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/#{1,6}\s/g, "")
        .replace(/[_`~]/g, "")
        .replace(/^[-•]\s/gm, "")
        .replace(/^\d+\.\s/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // Extrair refs
      const usedRefNumbers = new Set();
      const refMatches = answer.matchAll(/\[(\d+)\]/g);
      for (const match of refMatches) {
        const num = parseInt(match[1]);
        if (num > 0 && num <= refs.length) {
          usedRefNumbers.add(num);
        }
      }

      answer = answer.replace(/Baseado em.*$/im, "").replace(/Referências?:.*$/im, "").trim();

      let finalRefs = [];
      if (usedRefNumbers.size > 0) {
        finalRefs = Array.from(usedRefNumbers)
          .sort((a, b) => a - b)
          .map((num) => refs[num - 1])
          .filter(Boolean);
      } else {
        finalRefs = refs.slice(0, 3);
      }

      const payload = JSON.stringify({
        answer,
        refs: finalRefs,
      });

      await env.INCLUI_CACHE.put(cacheKey, payload, { expirationTtl: 86400 });

      return new Response(payload, {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(
        JSON.stringify({
          error: "Erro ao processar",
          detail: String(err?.message || err),
        }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
  },
};
