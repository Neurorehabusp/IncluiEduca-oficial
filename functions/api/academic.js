import { getAcademicPapers, jsonResponse, optionsResponse } from "./_lib.js";

export function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const question = String(body?.question || "").trim();

    if (!question) {
      return jsonResponse({ error: "Campo 'question' é obrigatório." }, 400);
    }

    const papers = await getAcademicPapers(question, env);
    return jsonResponse({ question, papers });
  } catch (error) {
    return jsonResponse(
      { error: "Falha ao consultar literatura.", detail: String(error?.message || error) },
      500,
    );
  }
}
