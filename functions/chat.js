// functions/chat.js - Cloudflare Pages Function
// OPÇÃO B: Simples, sem Worker separado

export async function onRequestPost(context) {
  const { request, env } = context;

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { question } = await request.json();
    const q = String(question || "").trim();

    if (!q || q.length < 5) {
      return new Response(
        JSON.stringify({
          answer: "Por favor, faça uma pergunta mais específica. Exemplo: Como ajudar um aluno com TEA que não fala?",
          refs: [],
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ===== BUSCAR EM CASCATA =====
    const pubmedResults = await searchPubMed(q, 10);
    let coreResults = [];
    if (pubmedResults.length < 5) {
      const coreApiKey = env.CORE_API_KEY || "";
      if (coreApiKey) {
        coreResults = await searchCore(q, coreApiKey, 12);
      }
    }

    let doajResults = [];
    if (pubmedResults.length + coreResults.length < 6) {
      doajResults = await searchDOAJ(q, 8);
    }

    const allPapers = [...pubmedResults, ...coreResults, ...doajResults];
    const papers = processPapers(allPapers, 6);

    if (papers.length === 0) {
      return new Response(
        JSON.stringify({
          answer: "Não encontrei estudos acadêmicos específicos para essa pergunta. Para melhorar meus resultados, me diga: 1) Idade do aluno; 2) Se ele faz vocalizações, gestos ou usa objetos para se comunicar; 3) Em quais situações ele tenta se comunicar; 4) Se há suspeita de perda auditiva ou outro diagnóstico.",
          refs: [],
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const refs = papers.map((p, i) => ({
      ref: `REF-${i + 1}`,
      title: p.title,
      year: p.year || "s/d",
      venue: p.venue || "s/d",
      authors: formatAuthors(p.authors),
      url: p.url || "",
      source: p.source || "",
    }));

    const contextText = papers
      .map(
        (p, i) => `
=== REF-${i + 1} ===
Título: ${p.title}
Ano: ${p.year || "s/d"}
Autores: ${formatAuthors(p.authors)}
Publicado em: ${p.venue || "s/d"}
Fonte: ${p.source}

RESUMO:
${p.abstract}
      `.trim()
      )
      .join("\n\n");

    const prompt = `Você é uma assistente especializada em educação infantil e desenvolvimento de linguagem de crianças com TEA.

IMPORTANTE: Responda de forma CONCISA e PRÁTICA. Máximo 4-5 linhas de ação.

Regras:
1. Use SOMENTE as evidências dos papers abaixo.
2. Respostas curtas e diretas, sem explicações longas.
3. Sem asteriscos, sem símbolos, sem formatação.
4. Forneça 3-4 estratégias práticas apenas.
5. Ao final liste: Referências: REF-1, REF-3 (apenas as usadas)

PERGUNTA:
${q}

LITERATURA:
${contextText}

Resposta concisa:`;

    const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.4,
    });

    let answer = String(aiResp.response || "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/[_`#~]/g, "")
      .trim();

    const referencesMatch = answer.match(/Referências?:\s*([^\n]+)/i);
    let usedRefs = [];

    if (referencesMatch) {
      const refText = referencesMatch[1];
      const refMatches = refText.match(/REF-\d+/g) || [];
      usedRefs = refMatches;
      answer = answer.replace(/Referências?:\s*[^\n]+/i, "").trim();
    }

    if (usedRefs.length === 0) {
      usedRefs = refs.slice(0, 3).map((r) => r.ref);
    }

    const filteredRefs = refs.filter((r) => usedRefs.includes(r.ref));

    return new Response(
      JSON.stringify({ answer, refs: filteredRefs }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar",
        detail: String(err?.message || err),
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
}

// ===== FUNÇÕES AUXILIARES =====

async function searchPubMed(query, limit = 8) {
  if (!query || query.trim().length === 0) return [];

  try {
    const searchUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    );
    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("term", query);
    searchUrl.searchParams.set("retmax", String(limit));
    searchUrl.searchParams.set("retmode", "json");

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) return [];

    const searchData = await searchResp.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    const fetchUrl = new URL(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    );
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", ids.join(","));
    fetchUrl.searchParams.set("retmode", "json");

    const fetchResp = await fetch(fetchUrl.toString());
    if (!fetchResp.ok) return [];

    const fetchData = await fetchResp.json();
    const articles = fetchData?.result?.uids
      ?.map((uid) => fetchData.result[uid])
      .filter(Boolean) || [];

    return articles
      .map((article) => ({
        paperId: article?.uid || "",
        title: String(article?.title || "").substring(0, 200),
        abstract: String(article?.abstract || "").substring(0, 800),
        year: String(article?.year || ""),
        venue: article?.journal || article?.article?.journal?.title || "",
        authors: (article?.article?.authorlist || []).map((a) => ({
          name:
            [a.lastname, a.initials].filter(Boolean).join(" ") ||
            a.collectivename ||
            "Unknown",
        })),
        url: `https://pubmed.ncbi.nlm.nih.gov/${article?.uid}/`,
        source: "PubMed",
      }))
      .filter((p) => p.abstract && p.abstract.length > 50);
  } catch (e) {
    console.error("PubMed error:", e);
    return [];
  }
}

async function searchCore(query, apiKey, limit = 8) {
  if (!query || query.trim().length === 0 || !apiKey) return [];

  try {
    const url = new URL("https://api.core.ac.uk/v3/search/works");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("api_key", apiKey);

    const resp = await fetch(url.toString());
    if (!resp.ok) return [];

    const data = await resp.json();
    const results = data?.results || [];

    return results
      .filter((p) => p.abstract && p.abstract.length > 50)
      .map((p) => ({
        paperId: p.id || p.doi || "",
        title: p.title || "",
        abstract: String(p.abstract).substring(0, 800),
        year: p.published_date
          ? new Date(p.published_date).getFullYear()
          : "",
        venue: p.source?.title || "",
        authors: (p.authors || []).map((a) => ({
          name: a.name || a,
        })),
        url: p.doi ? `https://doi.org/${p.doi}` : p.urls?.[0] || "",
        source: "CORE",
      }))
      .slice(0, limit);
  } catch (e) {
    console.error("CORE error:", e);
    return [];
  }
}

async function searchDOAJ(query, limit = 8) {
  if (!query || query.trim().length === 0) return [];

  try {
    const url = new URL("https://doaj.org/api/v3/search/articles");
    url.searchParams.set("q", query);
    url.searchParams.set("pageSize", String(limit));

    const resp = await fetch(url.toString());
    if (!resp.ok) return [];

    const data = await resp.json();
    const results = data?.results || [];

    return results
      .filter((p) => p.bibjson?.abstract && p.bibjson.abstract.length > 50)
      .map((p) => ({
        paperId: p.id || p.bibjson?.identifier?.[0] || "",
        title: p.bibjson?.title || "",
        abstract: String(p.bibjson?.abstract || "").substring(0, 800),
        year: p.bibjson?.year || "",
        venue:
          p.bibjson?.journal?.title || p.bibjson?.journal?.[0]?.title || "",
        authors: (p.bibjson?.author || [])
          .map((a) => ({ name: a.name || "" }))
          .filter((a) => a.name),
        url: p.bibjson?.link?.[0]?.url || "",
        source: "DOAJ",
      }))
      .slice(0, limit);
  } catch (e) {
    console.error("DOAJ error:", e);
    return [];
  }
}

function processPapers(papers, limit = 6) {
  const seen = new Set();
  const processed = [];

  for (const p of papers) {
    const key = p.paperId || p.url || p.title;
    if (!key || seen.has(key)) continue;

    seen.add(key);

    if (!p.abstract || p.abstract.length < 30) continue;

    processed.push({
      ...p,
      abstract: p.abstract.substring(0, 800),
    });

    if (processed.length >= limit) break;
  }

  return processed;
}

function formatAuthors(authors) {
  const names = (authors || [])
    .map((a) => a?.name)
    .filter(Boolean);

  if (!names.length) return "Autor desconhecido";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(" e ");

  return names.slice(0, 2).join(", ") + " et al.";
}
