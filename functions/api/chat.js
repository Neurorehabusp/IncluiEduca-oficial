import { fallbackNoResults, optionsResponse, sseResponse, streamSingleMessage } from "./_lib.js";

const SYSTEM_PROMPT =
  "Você é o assistente do Incluicanva para educação inclusiva. Responda de forma prática, objetiva e ética. Se faltar contexto, peça mais informações antes de concluir.";

export function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!incomingMessages.length) {
      return sseResponse(streamSingleMessage(fallbackNoResults()));
    }

    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...incomingMessages].map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
    }));

    const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages,
      stream: true,
      temperature: 0.4,
      max_tokens: 900,
    });

    return sseResponse(stream);
  } catch (error) {
    return sseResponse(streamSingleMessage(`Erro ao gerar resposta: ${String(error?.message || error)}`));
  }
}
