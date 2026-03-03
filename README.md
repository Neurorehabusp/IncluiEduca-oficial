# 🎓 Incluicanva - Assistente de Educação Inclusiva

Assistente inteligente que busca evidências científicas para ajudar professores com estratégias de inclusão para alunos com TEA.

## 🚀 Como Funciona

1. **Busca Acadêmica**: Consulta PubMed.ai, CORE e DOAJ
2. **IA Contextual**: Llama 3.1 gera respostas baseadas nos estudos encontrados
3. **Cache Inteligente**: Respostas são cacheadas por 24h

## 📁 Estrutura

```
📦 Projeto
├── worker.js       → Cloudflare Worker (backend)
├── index.html      → Interface do usuário
└── README.md       → Este arquivo
```

## ⚙️ Configuração

### 1. Cloudflare Worker

```bash
# Deploy do worker
wrangler deploy worker.js

# Configurar variáveis de ambiente
wrangler secret put CORE_API_KEY  # Opcional
```

### 2. Bindings Necessários

No dashboard do Cloudflare:
- **KV Namespace**: `INCLUI_CACHE`
- **AI Binding**: `AI` (Workers AI)

### 3. Frontend

Pode hospedar o `index.html` em:
- Cloudflare Pages
- GitHub Pages
- Netlify
- Qualquer servidor estático

Atualize a URL do worker no HTML:
```javascript
const API_URL = "https://seu-worker.workers.dev/chat";
```

## 🔑 Variáveis de Ambiente

- `CORE_API_KEY` (opcional): API key do CORE para mais resultados
  - Obtenha em: https://core.ac.uk/api-keys/register

## 📝 Exemplo de Uso

```javascript
fetch("https://seu-worker.workers.dev/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: "Como ajudar um aluno com TEA que não fala na sala de aula?"
  })
})
```

## 🎯 Fontes de Dados

1. **PubMed.ai** - Principal (mais confiável)
2. **CORE** - Backup (requer API key)
3. **DOAJ** - Backup (gratuito)

## 🛠️ Tecnologias

- **Backend**: Cloudflare Workers
- **IA**: Llama 3.1 (Workers AI)
- **Cache**: Cloudflare KV
- **APIs**: PubMed.ai, CORE, DOAJ

## 📊 Limites

- Cache: 24 horas
- Papers por resposta: até 4
- Tokens IA: 600 por resposta

## 🐛 Troubleshooting

**Problema**: Retorna "Não encontrei estudos"
- Verifique se a pergunta tem palavras-chave relacionadas a TEA/inclusão
- Tente reformular com mais detalhes

**Problema**: Respostas genéricas
- Limpe o cache KV
- Verifique se PubMed.ai está respondendo (logs)

## 📄 Licença

Projeto educacional - uso livre
