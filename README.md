# INCLUIEDUCA

## Endpoints (Cloudflare Pages Functions)

- `POST /api/academic` → `{ question }` e retorna `{ question, papers }`.
- `POST /api/chat` → `{ messages }` e retorna streaming SSE.
- `POST /api/complete` → `{ question, messages }`, busca literatura e retorna streaming SSE.

## Testes rápidos

```bash
curl -X POST http://localhost:8788/api/academic \
  -H "content-type: application/json" \
  -d '{"question":"autismo comunicação alternativa"}'
```

```bash
curl -N -X POST http://localhost:8788/api/chat \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"Olá"}]}'
```

```bash
curl -N -X POST http://localhost:8788/api/complete \
  -H "content-type: application/json" \
  -d '{"question":"estratégias para inclusão de aluno com TEA","messages":[{"role":"user","content":"Me dê ideias práticas"}]}'
```
