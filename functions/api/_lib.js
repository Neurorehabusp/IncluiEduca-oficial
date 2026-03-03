const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function optionsResponse() {
  return new Response(null, { headers: CORS_HEADERS });
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

export function sseResponse(stream) {
  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

export function normalizePaper(raw) {
  return {
    source: raw.source || "",
    title: raw.title || "Sem título",
    year: raw.year || "",
    url: raw.url || "",
    authors: Array.isArray(raw.authors) ? raw.authors.filter(Boolean) : [],
    abstract: raw.abstract || "",
    venue: raw.venue || "",
  };
}

export async function searchPubMed(query, limit = 8) {
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", query);
  searchUrl.searchParams.set("retmax", String(limit));
  searchUrl.searchParams.set("retmode", "json");

  const searchResp = await fetch(searchUrl.toString());
  if (!searchResp.ok) return [];

  const searchData = await searchResp.json();
  const ids = searchData?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("id", ids.join(","));
  summaryUrl.searchParams.set("retmode", "json");

  const summaryResp = await fetch(summaryUrl.toString());
  if (!summaryResp.ok) return [];

  const summaryData = await summaryResp.json();
  return ids
    .map((id) => summaryData?.result?.[id])
    .filter(Boolean)
    .map((item) => normalizePaper({
      source: "PubMed",
      title: item.title || "",
      year: String(item.pubdate || "").slice(0, 4),
      url: item.uid ? `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/` : "",
      authors: (item.authors || []).map((a) => a.name).filter(Boolean),
      abstract: "Resumo disponível no PubMed.",
      venue: item.fulljournalname || item.source || "",
    }));
}

export async function searchDOAJ(query, limit = 8) {
  const doajUrl = new URL(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`);
  doajUrl.searchParams.set("pageSize", String(limit));
  doajUrl.searchParams.set("sort", "bibjson.year:desc");

  const resp = await fetch(doajUrl.toString());
  if (!resp.ok) return [];
  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((entry) => {
    const bib = entry?.bibjson || {};
    return normalizePaper({
      source: "DOAJ",
      title: bib.title || "",
      year: String(bib.year || ""),
      url: bib.link?.find((l) => l.url)?.url || entry?.id || "",
      authors: (bib.author || []).map((a) => a.name).filter(Boolean),
      abstract: bib.abstract || "",
      venue: bib.journal?.title || "",
    });
  });
}

export async function searchCORE(query, coreApiKey, limit = 8) {
  if (!coreApiKey) return [];

  const coreUrl = new URL("https://api.core.ac.uk/v3/search/works");
  coreUrl.searchParams.set("q", query);
  coreUrl.searchParams.set("limit", String(limit));

  const resp = await fetch(coreUrl.toString(), {
    headers: { Authorization: `Bearer ${coreApiKey}` },
  });
  if (!resp.ok) return [];

  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((item) => normalizePaper({
    source: "CORE",
    title: item.title || "",
    year: String(item.yearPublished || ""),
    url: item.downloadUrl || item.sourceFulltextUrls?.[0] || (item.doi ? `https://doi.org/${item.doi}` : ""),
    authors: (item.authors || []).map((a) => a.name).filter(Boolean),
    abstract: item.abstract || "",
    venue: item.journals?.[0]?.title || item.publisher || "",
  }));
}

export async function getAcademicPapers(query, env) {
  const [pubmed, doaj, core] = await Promise.all([
    searchPubMed(query, 8).catch(() => []),
    searchDOAJ(query, 8).catch(() => []),
    env.CORE_API_KEY ? searchCORE(query, env.CORE_API_KEY, 8).catch(() => []) : Promise.resolve([]),
  ]);

  const merged = [...pubmed, ...doaj, ...core].filter((paper) => paper.title);
  const unique = [];
  const seen = new Set();

  for (const paper of merged) {
    const key = `${paper.title.toLowerCase()}|${paper.year}|${paper.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(paper);
    if (unique.length >= 12) break;
  }

  return unique;
}

export function fallbackNoResults() {
  return "Não encontrei estudos suficientes para responder com segurança. Para eu te ajudar melhor, informe: 1) idade/série da criança, 2) objetivo principal da intervenção, 3) como ela se comunica hoje, 4) contexto em que a dificuldade acontece.";
}

export function streamSingleMessage(text) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
