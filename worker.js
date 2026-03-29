const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ===============================
// MAPEAMENTO EXPANDIDO
// ===============================
const ACADEMIC_MAPPING = {
  autism: [
    "autism spectrum disorder",
    "ASD",
    "autism",
    "autistic",
    "pervasive developmental disorder",
  ],
  speech: [
    "speech intervention",
    "language development",
    "speech therapy",
    "communication disorder",
    "selective mutism",
    "speech delay",
    "nonverbal",
  ],
  communication: [
    "communication skills",
    "augmentative alternative communication",
    "AAC",
    "social communication",
    "pragmatic language",
  ],
  preschool: [
    "early childhood education",
    "preschool",
    "kindergarten",
    "early intervention",
    "inclusive education",
    "mainstream classroom",
  ],
  intervention: [
    "evidence-based intervention",
    "peer-mediated intervention",
    "behavioral intervention",
    "naturalistic intervention",
    "applied behavior analysis",
    "ABA",
    "classroom intervention",
  ],
  interests: [
    "special interests",
    "restricted interests",
    "circumscribed interests",
    "hyperfocus",
    "motivation",
    "engagement",
  ],
  inclusion: [
    "inclusive education",
    "inclusion",
    "mainstreaming",
    "classroom integration",
    "educational inclusion",
  ],
};

// ===============================
//  DETECÇÃO MELHORADA
// ===============================
function detectTopics(question) {
  const q = question.toLowerCase();
  const detected = [];

  // TEA/Autismo
  if (
    q.includes("tea") ||
    q.includes("autismo") ||
    q.includes("autista") ||
    q.includes("asd") ||
    q.includes("espectro")
  ) {
    detected.push("autism");
  }

  // Comunicação/Fala
  if (
    q.includes("falar") ||
    q.includes("fala") ||
    q.includes("linguagem") ||
    q.includes("comunicar") ||
    q.includes("comunicação") ||
    q.includes("não fala") ||
    q.includes("verbal")
  ) {
    detected.push("speech", "communication");
  }

  // Interesses/Hiperfoco
  if (
    q.includes("hiperfoco") ||
    q.includes("interesse") ||
    q.includes("obsessão") ||
    q.includes("fixação") ||
    q.includes("carro") ||
    q.includes("trem") ||
    q.includes("dinossauro") ||
    q.includes("número")
  ) {
    detected.push("interests");
  }

  // Inclusão/Sala de aula
  if (
    q.includes("inclusão") ||
    q.includes("incluir") ||
    q.includes("sala") ||
    q.includes("turma") ||
    q.includes("alunos") ||
    q.includes("escola") ||
    q.includes("classe")
  ) {
    detected.push("inclusion", "preschool");
  }

  // Intervenção
  if (
    q.includes("ajudar") ||
    q.includes("estratégia") ||
    q.includes("como") ||
    q.includes("fazer") ||
    q.includes("intervir")
  ) {
    detected.push("intervention");
  }

  // Se detectou muito pouco, adiciona termos base
  if (detected.length < 2) {
    detected.push("autism", "intervention", "preschool");
  }

  return [...new Set(detected)];
}

// ===============================
//  CONSTRUIR QUERIES MÚLTIPLAS
// ===============================
function buildSearchQueries(question) {
  const topics = detectTopics(question);
  const queries = [];

  // Query 1: Termos detectados combinados
  const terms = [];
  for (const topic of topics) {
    if (ACADEMIC_MAPPING[topic]) {
      terms.push(...ACADEMIC_MAPPING[topic].slice(0, 3));
    }
  }
  if (terms.length > 0) {
    queries.push(terms.slice(0, 8).join(" OR "));
  }

  // Query 2: Combinação específica se tem hiperfoco
  if (topics.includes("interests")) {
    queries.push(
      "autism special interests intervention classroom OR autism restricted interests educational"
    );
  }

  // Query 3: Inclusão + TEA
  if (topics.includes("inclusion")) {
    queries.push("autism inclusive education classroom strategies");
  }

  // Query 4: Fallback genérico
  queries.push("autism classroom intervention early childhood");

  return queries;
}

// ===============================
// BUSCA PUBMED.AI
// ===============================
async function searchPubMedAI(query, limit = 10) {
  if (!query || query.trim().length === 0) return [];

  try {
    const url = new URL("https://service.pubmed.ai/search");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));

    const resp = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.error("PubMed.ai search failed:", resp.status);
      return [];
    }

    const data = await resp.json();
    const articles = data?.articles || [];

    const results = articles
      .filter((a) => a.abstract && a.abstract.length > 50)
      .map((a) => ({
        paperId: String(a.pmid || a.id || ""),
        title: (a.title || "").substring(0, 200),
        abstract: (a.abstract || "").substring(0, 500),
        year: String(a.year || a.publication_year || ""),
        venue: a.journal || a.venue || "",
        authors: (a.authors || []).map((name) => ({
          name: typeof name === "string" ? name : name.name || "Unknown",
        })),
        url: a.pmid
          ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`
          : a.url || "",
        source: "PubMed.ai",
      }));

    console.log(`PubMed.ai: ${results.length} articles found`);
    return results;
  } catch (e) {
    console.error("PubMed.ai error:", e);
    return [];
  }
}

// ===============================
// BUSCA PUBMED OFICIAL
// ===============================
async function searchPubMed(query, limit = 10) {
  if (!query || query.trim().length === 0) return [];

  try {
    const searchUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    );
    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("term", query);
    searchUrl.searchParams.set("retmax", String(limit));
    searchUrl.searchParams.set("retmode", "json");
    searchUrl.searchParams.set("sort", "relevance");

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) {
      console.error("PubMed search failed:", searchResp.status);
      return [];
    }

    const searchData = await searchResp.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) {
      console.log("No PubMed IDs found for query:", query);
      return [];
    }

    console.log(`PubMed oficial: Found ${ids.length} IDs`);

    const summaryUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    );
    summaryUrl.searchParams.set("db", "pubmed");
    summaryUrl.searchParams.set("id", ids.join(","));
    summaryUrl.searchParams.set("retmode", "json");

    const summaryResp = await fetch(summaryUrl.toString());
    if (!summaryResp.ok) {
      console.error("PubMed summary failed:", summaryResp.status);
      return [];
    }

    const summaryData = await summaryResp.json();
    const results = summaryData?.result || {};

    const articles = [];
    for (const id of ids) {
      const article = results[id];
      if (!article) continue;

      const authors = (article.authors || []).map((a) => ({
        name: a.name || "Unknown",
      }));

      articles.push({
        paperId: id,
        title: (article.title || "").substring(0, 200),
        abstract: "",
        year: article.pubdate ? article.pubdate.split(" ")[0] : "",
        venue: article.source || "",
        authors: authors,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: "PubMed",
      });
    }

    const topIds = ids.slice(0, 5);
    const abstractsMap = await fetchPubMedAbstracts(topIds);

    for (const article of articles) {
      if (abstractsMap[article.paperId]) {
        article.abstract = abstractsMap[article.paperId];
      }
    }

    const withAbstracts = articles.filter(
      (a) => a.abstract && a.abstract.length > 50
    );

    console.log(`PubMed oficial: ${withAbstracts.length} with abstracts`);
    return withAbstracts;
  } catch (e) {
    console.error("PubMed error:", e);
    return [];
  }
}

// ===============================
// 📄 BUSCAR ABSTRACTS PUBMED
// ===============================
async function fetchPubMedAbstracts(ids) {
  if (!ids || ids.length === 0) return {};

  try {
    const fetchUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    );
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", ids.join(","));
    fetchUrl.searchParams.set("retmode", "xml");
    fetchUrl.searchParams.set("rettype", "abstract");

    const resp = await fetch(fetchUrl.toString());
    if (!resp.ok) return {};

    const xml = await resp.text();

    const abstractsMap = {};
    const articleMatches = xml.matchAll(
      /<PubmedArticle>.*?<PMID[^>]*>(\d+)<\/PMID>.*?<AbstractText[^>]*>(.*?)<\/AbstractText>.*?<\/PubmedArticle>/gs
    );

    for (const match of articleMatches) {
      const pmid = match[1];
      const abstract = match[2].replace(/<[^>]+>/g, "").trim();
      if (abstract.length > 50) {
        abstractsMap[pmid] = abstract.substring(0, 500);
      }
    }

    return abstractsMap;
  } catch (e) {
    console.error("Abstract fetch error:", e);
    return {};
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
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!resp.ok) {
      console.error("CORE search failed:", resp.status);
      return [];
    }

    const data = await resp.json();
    const results = data?.results || [];

    const articles = results
      .filter((p) => p.abstract && p.abstract.length > 50)
      .map((p) => ({
        paperId: p.id || p.doi || "",
        title: (p.title || "").substring(0, 200),
        abstract: String(p.abstract).substring(0, 500),
        year: p.yearPublished || p.publishedDate?.split("-")[0] || "",
        venue: p.journals?.[0]?.title || p.publisher || "",
        authors: (p.authors || []).map((a) => ({
          name: a.name || a,
        })),
        url: p.downloadUrl || p.sourceFulltextUrls?.[0] || "",
        source: "CORE",
      }));

    console.log(`CORE: ${articles.length} articles found`);
    return articles.slice(0, limit);
  } catch (e) {
    console.error("CORE error:", e);
    return [];
  }
}

// ===============================
// BUSCA DOAJ
// ===============================
async function searchDOAJ(query, limit = 10) {
  if (!query) return [];

  try {
    const url = new URL(
      "https://doaj.org/api/search/articles/" + encodeURIComponent(query)
    );
    url.searchParams.set("pageSize", String(limit));

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error("DOAJ search failed:", resp.status);
      return [];
    }

    const data = await resp.json();
    const results = data?.results || [];

    const articles = results
      .filter((p) => p.bibjson?.abstract)
      .map((p) => ({
        paperId: p.id || "",
        title: (p.bibjson?.title || "").substring(0, 200),
        abstract: String(p.bibjson?.abstract || "").substring(0, 500),
        year: p.bibjson?.year || "",
        venue: p.bibjson?.journal?.title || "",
        authors: (p.bibjson?.author || []).map((a) => ({
          name: a.name || "",
        })),
        url: p.bibjson?.link?.[0]?.url || "",
        source: "DOAJ",
      }));

    console.log(`DOAJ: ${articles.length} articles found`);
    return articles;
  } catch (e) {
    console.error("DOAJ error:", e);
    return [];
  }
}

// ===============================
// FORMATAÇÃO AUTORES
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
// WORKER PRINCIPAL
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
      const body = await req.json();
      const question = String(body?.question || "").trim();
      const q = question;

      if (!q || q.length < 5) {
        return new Response(
          JSON.stringify({
            answer:
              "Por favor, faça uma pergunta mais específica sobre educação inclusiva e TEA.",
            refs: [],
          }),
          { headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Cache
      const cacheKey = "answer:" + (await hashKey(q));
      const cached = await env.INCLUI_CACHE.get(cacheKey);
      if (cached) {
        console.log("Cache hit");
        return new Response(cached, {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      console.log("Question:", q);

      // ===============================
      //  BUSCA COM MÚLTIPLAS FONTES
      // ===============================
      const queries = buildSearchQueries(q);
      console.log("Search queries:", queries);

      let allPapers = [];

      // Tentar cada query até conseguir resultados
      for (const searchQuery of queries) {
        console.log(`Trying query: ${searchQuery}`);

        //  PRIORIDADE 1: PubMed.ai (mais confiável)
        const pubmedAI = await searchPubMedAI(searchQuery, 8);
        allPapers.push(...pubmedAI);

        if (allPapers.length >= 4) break;

        // PRIORIDADE 2: PubMed oficial
        const pubmed = await searchPubMed(searchQuery, 8);
        allPapers.push(...pubmed);

        if (allPapers.length >= 4) break;

        // PRIORIDADE 3: CORE
        if (env.CORE_API_KEY) {
          const core = await searchCore(searchQuery, env.CORE_API_KEY, 8);
          allPapers.push(...core);
        }

        if (allPapers.length >= 4) break;

        // PRIORIDADE 4: DOAJ
        const doaj = await searchDOAJ(searchQuery, 6);
        allPapers.push(...doaj);

        if (allPapers.length >= 4) break;
      }

      const papers = processPapers(allPapers, 4);
      console.log(`Final: ${papers.length} papers`);

      // ===============================
      //  SEM RESULTADOS
      // ===============================
      if (papers.length === 0) {
        const fallback = JSON.stringify({
          answer:
            "Não encontrei estudos acadêmicos específicos. Tente reformular com mais detalhes: idade da criança, comportamento específico que quer abordar, ou contexto da situação.",
          refs: [],
        });

        await env.INCLUI_CACHE.put(cacheKey, fallback, {
          expirationTtl: 86400,
        });

        return new Response(fallback, {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // ===============================
      //  MONTAR CONTEXTO
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
            `[${i + 1}] ${formatAuthors(p.authors)} (${p.year || "s/d"}). ${
              p.title
            }
Resumo: ${p.abstract || "Sem resumo disponível"}`
        )
        .join("\n\n");

      // ===============================
      // 🤖 PROMPT PARA IA
      // ===============================
      const prompt = `Você é um assistente especializado em educação inclusiva e TEA (Transtorno do Espectro Autista).

Baseado nesta pergunta de uma professora: "${q}"

E nestes artigos científicos como contexto:
${context}

Por favor, responda com:
1. "O que fazer agora:" seguido de 3-5 ações práticas e concretas para sala de aula
2. "Como registrar:" com sugestões breves de como documentar isso
3. Uma pergunta rápida de acompanhamento para melhorar a próxima resposta

Responda de forma clara, prática e baseada em evidências científicas.`;

      // ===============================
      // 🧠 CHAMAR IA (Cloudflare AI)
      // ===============================
      const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.6,
      });

      let answer = String(aiResp.response || "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/#{1,6}\s/g, "")
        .replace(/[_`~]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // Limpar respostas geradas
      answer = answer
        .replace(/Baseado em.*$/im, "")
        .replace(/Referências?:.*$/im, "")
        .trim();

      // ===============================
      // FORMATAR RESPOSTA COM REFS
      // ===============================
      const payload = JSON.stringify({
        answer: answer,
        refs: refs.slice(0, 3),
      });

      await env.INCLUI_CACHE.put(cacheKey, payload, {
        expirationTtl: 86400,
      });

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
        {
          status: 500,
          headers: { ...CORS, "Content-Type": "application/json" },
        }
      );
    }
  },
};
