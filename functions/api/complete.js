import {
  fallbackNoResults,
  getAcademicPapers,
  optionsResponse,
  sseResponse,
  streamSingleMessage,
} from "./_lib.js";

const SYSTEM_PROMPT =
  "Você é o assistente do Incluicanva para educação inclusiva. Responda com estratégias práticas, sem inventar referências e peça contexto quando faltar informação.";

function buildReferencesContext(papers) {
  return papers
    .map((paper, index) => {
      const authors = paper.authors?.length ? paper.authors.join(", ") : "Autores não informados";
      return [
        `[REF-${index + 1}]`,
        `Fonte: ${paper.source}`,
        `Título: ${paper.title}`,
        `Ano: ${paper.year || "s/d"}`,
        `Autores: ${authors}`,
        `Periódico/Evento: ${paper.venue || "não informado"}`,
        `URL: ${paper.url || "não informado"}`,
        `Resumo: ${paper.abstract || "não informado"}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const question = String(body?.question || "").trim();
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!question) {
      return sseResponse(streamSingleMessage("Campo 'question' é obrigatório."));
    }

    const papers = await getAcademicPapers(question, env);
    if (!papers.length) {
      return sseResponse(streamSingleMessage(fallbackNoResults()));
    }

    const referencesContext = buildReferencesContext(papers);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "Use apenas as referências abaixo como base factual. Se não houver evidência direta para um ponto, diga explicitamente que é hipótese prática e peça dados adicionais.\n\n" +
          referencesContext,
      },
      ...incomingMessages.map((msg) => ({
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : "",
      })),
      {
        role: "user",
        content: `Pergunta principal: ${question}\n\nResponda de forma prática e cite no texto [REF-x] quando usar uma referência.`,
      },
    ];

    const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages,
      stream: true,
      temperature: 0.35,
      max_tokens: 1100,
    });

    return sseResponse(stream);
  } catch (error) {
    return sseResponse(streamSingleMessage(`Erro ao gerar resposta completa: ${String(error?.message || error)}`));
  }
}
