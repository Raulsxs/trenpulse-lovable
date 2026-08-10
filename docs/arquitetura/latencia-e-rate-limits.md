# Latência e Rate Limits — OpenRouter, provedores diretos e alternativas

> Pesquisa feita em 2026-08-10 para o TrendPulse. Contexto: SaaS pequeno, texto via
> `anthropic/claude-haiku-4.5` + `google/gemini-2.5-flash`, imagem via `openai/gpt-image-2` e
> `google/gemini-3-pro-image`, tudo pelo OpenRouter. Tráfego em rajada (carrossel = 4-6 imagens em
> paralelo). Dor: ~85s por post; medo de teto ao escalar.

## Legenda de confiança

| Marca | Significado |
|---|---|
| **[DOC]** | Documentação oficial do fornecedor. Fato. |
| **[MEDIDO-NOSSO]** | Número medido pelo próprio TrendPulse, registrado em `supabase/functions/_shared/openrouter.ts`. |
| **[3P]** | Medição/benchmark de terceiro (blog, benchmark independente). Direção confiável, número exato não. |
| **[MERCADO]** | Prática comum relatada, sem fonte primária. |
| **[INCERTO]** | Não há informação pública confiável. Explicitamente marcado como buraco. |

---

## 0. TL;DR — as 4 conclusões que importam

1. **O teto do OpenRouter não é o seu problema.** Para modelos pagos o OpenRouter **não impõe** rate
   limit de plataforma; o 429 que você levar virá do provedor upstream. **[DOC]**
2. **Sua latência não é do gateway.** O overhead do OpenRouter é da ordem de **dezenas de
   milissegundos** (~25-55ms). **[DOC/3P]** Os ~85s são o modelo de imagem, não a rota.
3. **O maior lever está no seu próprio código.** Vocês já mediram: `gpt-image-2` = **68s**,
   Nano Banana Pro (`gemini-3-pro-image`) = **23s**, ambos com pt-BR perfeito. **[MEDIDO-NOSSO]**
   Hoje o **default é o modelo 3x mais lento**. Trocar o default derruba o post de ~85s para ~40s
   sem tocar em infra, sem contrato, sem migração.
4. **Se for sair do OpenRouter, saia só para imagem, e para o fal.ai** — que tem fila + webhook +
   concorrência explícita, exatamente o que falta hoje. Texto pode ficar onde está.

---

## 1. OpenRouter — limites reais

### 1.1 Existe rate limit para conta paga?

**[DOC]** A documentação de limites do OpenRouter só quantifica caps de plataforma para os modelos
`:free`:

| Situação | Limite |
|---|---|
| Modelos `:free`, sem crédito comprado | 20 req/min, 50 req/dia |
| Modelos `:free`, com ≥ $10 comprados | 20 req/min, 1.000 req/dia |
| **Modelos pagos** | **Sem cap de plataforma documentado** |

O que existe além disso, ainda **[DOC]**:

- **Saldo da conta**: saldo negativo devolve `402`, inclusive em modelos free.
- **Limite por chave**: cap opcional de gasto por API key, lido em `GET /api/v1/key`
  (campo `limit_remaining`).
- **Proteção Cloudflare**: bloqueia requisições que "excedem dramaticamente o uso razoável" — é
  anti-DDoS, não um número publicado.
- **Limites do provedor upstream**: o provedor por trás pode limitar por conta própria.

**Não existe** limite de concorrência ou de requisições por segundo publicado para conta paga.
**[DOC — ausência]** Fontes secundárias reforçam: comprar crédito **não** levanta RPM/TPM, porque
esse teto é política do provedor, não configuração de billing do gateway. **[3P]**

**Implicação direta para o carrossel:** disparar 4-6 imagens em `Promise.all` não bate em nada no
OpenRouter. Se der 429, é o pool do OpenAI/Google atrás dele. Como o OpenRouter usa a **chave dele**,
você está dividindo um pool agregado gigante — o que na prática é bom para rajada, mas te deixa sem
visibilidade e sem headroom garantido. **[INCERTO]** — o OpenRouter não publica que fração do pool
upstream cabe a você, nem se há fairness por conta.

### 1.2 Os limites escalam com saldo/gasto?

**[DOC]** Só na dimensão free (o $10 que sobe o cap diário de 50 → 1.000). Para modelos pagos não há
escada publicada de RPM/TPM por gasto. Comprar mais crédito **não** compra throughput.

Há um efeito colateral documentado que vale conhecer: manter saldo baixo faz o OpenRouter expirar
cache de credenciais na edge de forma mais agressiva, o que **piora latência**. A recomendação
oficial é manter **$10-20 de saldo mínimo** e auto-topup com threshold folgado. **[DOC]**
É barato e vale ligar.

### 1.3 Enterprise, priority routing, SLA

**[DOC/3P]** Existe tier Enterprise, com preço sob consulta, contratado via sales. O que aparece
listado: SSO/SAML, **SLA contratual**, suporte prioritário e canal dedicado, faturamento por invoice,
descontos por volume e um teto muito maior de inferência gratuita em BYOK. O material comercial
enfatiza "sem contrato de longo prazo obrigatório". **Os números do SLA (uptime, tempo de resposta,
créditos de serviço) não são públicos** — só em negociação. **[INCERTO]**

**Priority routing** no sentido de "fura fila" não é um produto do OpenRouter. O que existe é
**service tier repassado ao provedor** (seção 2.1).

### 1.4 O OpenRouter adiciona latência?

Sim, mas pouco:

| Fonte | Overhead medido |
|---|---|
| Home page do OpenRouter | ~25ms **[DOC]** |
| Doc de best practices / relato de produção | ~40ms **[DOC/3P]** |
| Comparativo de gateways 2026 | 40-55ms para OpenRouter; 10-20ms para LiteLLM self-host; 8-20ms Portkey **[3P]** |
| Benchmark de 200 chamadas GPT-4.1 | OpenRouter **70ms mais rápido** que OpenAI direto no TTFT (0,640s vs 0,712s) **[3P]** |

Leitura honesta: o overhead é real mas **irrelevante diante de um modelo de imagem que leva 23-68
segundos**. Vale 0,05% do seu tempo de resposta. Trocar o gateway para ganhar 40ms enquanto o
gpt-image-2 come 68s é otimizar o lugar errado.

Uma ressalva documentada: quando o cache de edge de uma região está frio (primeiros 1-2 minutos de
tráfego naquela região), a latência sobe até aquecer. **[DOC]** Para um SaaS BR com tráfego
intermitente isso pode aparecer como "a primeira geração do dia é mais lenta".

### 1.5 Provider routing — dá para pedir o mais rápido?

**[DOC]** Sim. O default do OpenRouter é **load balancing por preço** (mais barato primeiro,
ponderado por uptime). Campos do objeto `provider`:

| Campo | Tipo | O que faz |
|---|---|---|
| `sort` | string/objeto | Desliga o load balancing e ordena determinísticamente. Valores: `"throughput"`, `"latency"`, `"price"` |
| `order` | string[] | Lista de slugs de provedor, tentados em ordem |
| `allow_fallbacks` | bool | Permite cair para backup (default `true`) |
| `only` / `ignore` | string[] | Whitelist / blacklist de provedor |
| `require_parameters` | bool | Só roteia para provedor que suporta todos os params do request |
| `data_collection` | `"allow"`/`"deny"` | Filtra por política de retenção |
| `max_price` | objeto | Teto de preço aceitável |

- `sort: "throughput"` → prioriza maior tokens/s. Atalho: sufixo `:nitro` no slug.
- `sort: "latency"` → prioriza menor tempo de resposta.
- `sort: "price"` → atalho `:floor`.

**[DOC]** O `provider` também vale no endpoint de imagem (`POST /api/v1/images`) — `provider.only`,
`provider.order`, `provider.ignore`, `provider.sort` são aceitos lá.

**Pegadinha para o TrendPulse:** vocês usam `openai/gpt-image-2` e `google/gemini-3-pro-image`.
Esses modelos são hospedados por **um único provedor** (a própria OpenAI / o próprio Google). A
página do Nano Banana Pro no OpenRouter diz explicitamente que há **um provedor só** e que o
OpenRouter "encaminha direto — nenhuma decisão de roteamento a tomar". **[DOC]** Ou seja:
**`sort: "throughput"` não faz nada para vocês nesses dois modelos.** Só faria diferença em modelos
open-weight multi-provedor (FLUX, Qwen, Llama).

---

## 2. Como reduzir latência na prática

### 2.1 Service tiers (o que de fato acelera no OpenRouter)

**[DOC]** O OpenRouter repassa service tier do provedor via parâmetro **top-level** `service_tier`:

```json
{ "model": "openai/gpt-image-2", "service_tier": "priority", "prompt": "..." }
```

Valores: `"flex"`, `"priority"`, `"fast"` (alias de priority), ou omitir para default.
Provedores que suportam: **OpenAI, Google Vertex, Google AI Studio** e xAI (só priority).
O `flex` dá ~50% de desconto em troca de **mais** latência e menos disponibilidade — o oposto do que
vocês querem. A resposta traz um campo `service_tier` indicando o tier realmente usado, e a cobrança
segue o tier usado, não o pedido.

⚠️ **[INCERTO]** A doc de imagem do OpenRouter **não menciona** `service_tier`. Não achei
confirmação de que `service_tier: "priority"` funcione no endpoint `/api/v1/images`. **Isso é um
teste de 10 minutos** — mandar uma request com `service_tier: "priority"` e olhar o campo
`service_tier` da resposta. Vale fazer antes de qualquer coisa maior.

Contexto do lado OpenAI: o produto "Priority Processing" foi renomeado para **Fast mode** em
2026-07-30, com claim de até **2,5x mais rápido** que o Standard em modelos suportados. **[3P]** SLA
de latência só existe em acordo Enterprise. **[3P]**
Do lado Anthropic: o **Priority Tier não é mais vendido**; a doc de service tiers diz que os
compromissos de capacidade do Priority Tier não estão mais disponíveis para compra. **[3P]**

### 2.2 Escolha de modelo — o maior lever, de longe

Medições do próprio TrendPulse, registradas em `_shared/openrouter.ts` (mesmo prompt, 2026-07-31):

| Modelo | pt-BR | Latência | Custo/imagem |
|---|---|---|---|
| `openai/gpt-image-2` (quality medium) | perfeito | **68s** (código diz ~79s no builder legado) | $0,053 |
| `google/gemini-3-pro-image` (Nano Banana Pro) | perfeito | **23s** | $0,139 |
| `google/gemini-2.5-flash-image` | **erra** ("Lingulagem", "adotom") | rápido | barato |
| `bytedance-seed/seedream-4.5` | ~ok | — | econômico |

**[MEDIDO-NOSSO]** E o default hoje é `openai/gpt-image-2` — o mais lento dos dois que acertam pt-BR.
A justificativa no código é margem ($0,053 vs $0,139). É uma escolha legítima de negócio, mas é
**exatamente onde estão os 85s**.

Referências externas coerentes com isso:

- **gpt-image-2** é caro em tempo por design: o modelo faz "Understand → Plan → Generate → Review",
  e a faixa de tempo vai de ~5s a ~235s dependendo de config. Com `quality="high"` em 1024×1024 há
  relato de **mediana ~195s e p95 ~280s**. Com `quality="low"` cai 30-50x. Em Tier 2 o p50
  "model-bound" fica em **8-25s** conforme qualidade e modo de raciocínio. **[3P]**
  → O `quality: "medium"` que vocês usam é o que compra os 68-79s. **`quality` é um dial, não uma
  constante.**
- **Nano Banana Pro** é reportado com geração abaixo de ~2s em alguns testes e "poucos segundos" no
  modo Flash. **[3P]** Os 23s de vocês incluem `resolution: "2K"` + ida e volta do base64, então o
  número de vocês é o que vale.
- Modelos notoriamente rápidos hoje: **FLUX schnell** (sub-1s no fal.ai **[3P]**), Nano Banana 2
  Lite (~4s **[3P]**), Seedream. Modelos notoriamente lentos: gpt-image-2 em `high`, qualquer coisa
  com etapa de raciocínio/revisão.

### 2.3 Streaming

**[DOC]** O endpoint de imagem do OpenRouter suporta **streaming de imagem via SSE** para modelos com
`supports_streaming: true`: emite **imagens parciais**, evento de conclusão e erros. Isso não muda o
tempo total, mas muda radicalmente a **percepção** — o usuário vê a imagem se formando em vez de um
spinner mudo por 68s.

**[INCERTO]** Não achei a lista de quais modelos de imagem têm `supports_streaming: true`. Dá para
descobrir consultando `GET /api/v1/models` e olhando a flag por modelo.

Para texto vocês já fazem streaming (`streamOne` no `openrouter.ts`), então essa parte está resolvida.

### 2.4 Arquitetura: síncrono vs assíncrono

Aqui está a limitação estrutural mais séria do stack atual:

**[DOC]** O `/api/v1/images` do OpenRouter é **síncrono** (ou SSE). **Não existe submit + poll, não
existe webhook.** A própria doc do OpenRouter mostra um exemplo em que a imagem levou **94 segundos**.

Consequência prática: uma Edge Function do Supabase segurando 4-6 requisições de 68s em `Promise.all`
está apostando contra o wall-clock do runtime e contra o timeout do gateway. Já existe evidência
disso no código de vocês — o comentário diz que `quality: "high"` "arriscaria o 504 do carrossel".

**[MERCADO]** O padrão para geração longa é: aceitar o job → devolver `202` + `job_id` na hora →
processar fora do request → notificar por webhook/realtime. Concretamente no stack de vocês:

- gravar o job em tabela e devolver imediatamente;
- worker (função separada, ou fila) gera slide a slide;
- front escuta **Supabase Realtime** na linha do conteúdo e vai preenchendo os slides conforme chegam.

Isso não deixa nada mais rápido em wall-clock, mas: (a) remove a classe inteira de bug 504,
(b) faz o carrossel aparecer **incrementalmente** (slide 1 em ~25s em vez de tudo em ~85s), e
(c) permite retry por slide sem refazer o carrossel.

Os provedores de imagem especializados já entregam isso pronto: fal.ai tem `queue.fal.run` +
webhook + retry automático **[DOC]**; Replicate tem predictions assíncronas + webhooks **[DOC]**.

### 2.5 Prompt caching

**[DOC]** Providers suportados via OpenRouter: OpenAI, Anthropic, Google Gemini, DeepSeek, Grok,
Moonshot, Groq, Qwen, Z.AI. Automático na maioria; **Anthropic e Qwen exigem `cache_control`
explícito** em breakpoints. Descontos de leitura de cache:

| Provider | Preço da leitura cacheada |
|---|---|
| Anthropic | 0,1x |
| DeepSeek | 0,1x |
| Google Gemini | 0,25x |
| Grok / Moonshot | 0,25x |
| OpenAI | 0,25x-0,50x (varia por modelo) |
| Groq | 0,5x |

O OpenRouter usa **sticky routing** para manter o cache quente dentro de uma conversa. **[DOC]**

**[DOC — Anthropic]** Detalhe que vale ouro para escala: na Anthropic, `cache_read_input_tokens`
**não conta** para o limite de ITPM (exceto Haiku 3.5). Ou seja, cache não só corta custo — **levanta
o teto efetivo de throughput**. Exemplo da própria doc: 2M ITPM com 80% de hit rate = 10M tokens de
input efetivos por minuto.

**Aplicabilidade no TrendPulse:** o `system` do agente + as definições de tools + o contexto de marca
são exatamente o material que se cacheia. Mas o ganho é em **custo e teto**, não em latência de
imagem. **[INCERTO]** — não há número público confiável de quanto o prompt caching reduz TTFT.

---

## 3. Alternativas ao OpenRouter — comparativo honesto

| Opção | Overhead do gateway | Limites p/ empresa pequena | Assíncrono / fila | Bom para |
|---|---|---|---|---|
| **OpenRouter** (atual) | ~25-55ms **[DOC/3P]** | Sem cap de plataforma em modelos pagos; herda upstream **[DOC]** | ❌ imagem é síncrona/SSE **[DOC]** | Catálogo largo, 1 contrato, fallback entre modelos |
| **OpenAI direto** | 0 | Tier 1: **5 IPM**; Tier 2: 20 IPM **[3P]** | Batch API (não é real-time) | Só se você já for Tier 4/5 |
| **Anthropic direto** | 0 | Start tier: Haiku 4.5 = 1.000 RPM / 2M ITPM / 400k OTPM **[DOC]** | Batch API | Texto. Limites generosos desde o começo |
| **Google AI Studio** | 0 | Tier 1 com RPD baixo (relatos de 250 RPD) **[3P]** | Batch | Barato; limites apertados no início |
| **Google Vertex** | 0 | Quota por projeto/região, pedível no console **[DOC]** | Batch | Quando precisa de SLA e quota nominal |
| **fal.ai** | — | **2 concorrentes** no início, escala automático até **40** por compra de crédito; >40 só com sales **[DOC]** | ✅ fila + webhook + retry automático **[DOC]** | **Imagem, tráfego em rajada.** É o encaixe do caso |
| **Replicate** | — | **600 req/min** para criar prediction; 3.000 req/min nos demais endpoints **[DOC]** | ✅ predictions async + webhooks **[DOC]** | Catálogo largo de modelos abertos; cold start é o problema |
| **Groq / Cerebras** | — | — | — | **Texto** ultrarrápido em modelos abertos. Não fazem imagem |
| **Together / Fireworks** | — | — | — | Modelos abertos, throughput médio (100-300 tok/s **[3P]**) |
| **Portkey** | 8-20ms **[3P]** | — | — | Observabilidade/governança sobre o stack |
| **LiteLLM self-host** | 10-20ms **[3P]** | Você é o dono do teto | — | Quem quer controle e já tem infra |

### 3.1 Especificamente imagem: fal.ai vs Replicate

**[3P]** Benchmarks independentes de 2026 apontam consistentemente o fal.ai como mais rápido:

- FLUX: **fal.ai ~1,8s/imagem vs Replicate ~4,2s**.
- Outro benchmark: fal.ai na faixa de 2,3-2,5s de mediana.
- FLUX schnell no fal.ai: **abaixo de 1s**.
- Fila: Replicate adiciona **2-3s** antes de começar; fal.ai começa em ~0,5s.
- Cold start: Replicate pode chegar a **30-60s** na primeira request de um modelo frio; fal.ai
  mantém modelos quentes (<1s).

⚠️ Ressalva importante: esses números são para **FLUX**, modelo rápido. Eles **não** transferem para
gpt-image-2 ou Nano Banana Pro — que são modelos proprietários, com tempo dominado pelo próprio
modelo, não pela infra do host. Trocar de host **não** faz o gpt-image-2 responder em 2s.
O ganho real do fal.ai no caso de vocês é **arquitetural** (fila + webhook + concorrência explícita),
não mágica de velocidade nos modelos que vocês usam hoje.

### 3.2 Prós e contras para quem quer velocidade e não quer N contratos

**Ficar no OpenRouter:** 1 contrato, 1 chave, catálogo enorme, fallback entre modelos já implementado
(`AGENT_MODEL_CHAIN`), custo real no `usage.cost` (que vocês usam para telemetria de margem). Contras:
sem fila/webhook na imagem, sem visibilidade do headroom upstream, SLA só no Enterprise.

**Híbrido (recomendado):** OpenRouter para texto + fal.ai para imagem. Custo: 2 contratos. Ganho:
fila, webhook, retry automático e concorrência **numérica e conhecida** exatamente onde está a dor.

**Ir direto nos provedores:** para vocês hoje é **pior**. OpenAI Tier 1 dá **5 imagens/minuto** —
um único carrossel de 6 slides já estoura. O OpenRouter, usando a chave agregada dele, esconde esse
problema de vocês. Sair para OpenAI direto agora seria **regressão de capacidade**.

---

## 4. Tiers dos provedores diretos

### 4.1 OpenAI — **[DOC]**

| Tier | Qualificação | Limite mensal de uso |
|---|---|---|
| Free | Geografia elegível | $100 |
| Tier 1 | $5 pagos | $100 |
| Tier 2 | $50 pagos | $500 |
| Tier 3 | $100 pagos | $1.000 |
| Tier 4 | $250 pagos | $5.000 |
| Tier 5 | $1.000 pagos | $200.000 |

Dimensões enforçadas: **RPM, RPD, TPM, TPD e IPM** (images per minute) — bate a primeira que estourar.
A graduação é **automática por gasto acumulado**; a doc não documenta fluxo de pedido manual.
**[INCERTO]** — a doc atual não menciona mais o requisito de "dias desde o primeiro pagamento" que
existia em versões anteriores. Não afirme prazos.

IPM do gpt-image-2 por tier — **[3P]** (não confirmado em doc oficial, tratar como ordem de grandeza):

| Tier | TPM | **IPM** |
|---|---|---|
| 1 | 100.000 | **5** |
| 2 | 250.000 | **20** |
| 3 | 800.000 | **50** |
| 4 | 3.000.000 | **150** |
| 5 | 8.000.000 | **250** |

Conselho do mesmo material **[3P]**: "20 IPM não significa mandar 20 no primeiro segundo e descansar
59" — o enforcement é em janelas sub-minuto. Recomendação: manter concorrência em ~80% do IPM do tier,
distribuída ao longo do minuto, com backoff exponencial + jitter.

### 4.2 Anthropic — **[DOC]**

Tiers: **Start → Build → Scale → Custom**. Teto de gasto mensal: Start $500, Build $1.000,
Scale $200.000, Custom sem teto.

Limites do **Claude Haiku 4.5** (o que vocês usam):

| Tier | RPM | ITPM | OTPM |
|---|---|---|---|
| Start | 1.000 | 2.000.000 | 400.000 |
| Build | 5.000 | 5.000.000 | 1.000.000 |
| Scale | 10.000 | 10.000.000 | 2.000.000 |

Pontos que importam:

- **Organizações novas podem começar no "Evaluation tier"**, com limites *abaixo* da tabela, subindo
  automaticamente conforme se constrói histórico. **[DOC]**
- Rate limit por **token bucket** — reposição contínua, não reset em janela fixa. **[DOC]**
- **Limites de aceleração**: um pico brusco de uso pode gerar 429 mesmo dentro do limite nominal.
  A orientação oficial é **rampar tráfego gradualmente**. **[DOC]** ← relevante para rajada.
- "60 RPM pode ser enforçado como 1 req/s" — bursts curtos estouram. **[DOC]**
- Pedido de aumento: botão **Request rate limit increase** na página de Rate limits do Console; para
  urgência, suporte. **[DOC]** Não precisa falar com sales.
- Headers de resposta: `retry-after`, `anthropic-ratelimit-{requests,input-tokens,output-tokens}-{limit,remaining,reset}`.
  **[DOC]** — dá para instrumentar headroom sem adivinhar.

### 4.3 Google — AI Studio vs Vertex — **[DOC]**

Qualificação AI Studio:

| Tier | Qualificação | Cap de billing |
|---|---|---|
| Free | Projeto ativo / trial | — |
| Tier 1 | Conta de billing ativa vinculada | $250 |
| Tier 2 | **$100 pagos + 3 dias** do primeiro pagamento | $2.000 |
| Tier 3 | **$1.000 pagos + 30 dias** do primeiro pagamento | $20.000-$100.000+ |

Proteção adicional por gasto em janela deslizante de 10 minutos: **Tier 1 = $10/10min;
Tiers 2 e 3 = $200/10min**. **[DOC]** ← Isso é um teto de gasto por rajada, e para geração de imagem
(cara por chamada) pode morder antes do RPM. Vale calcular.

Dimensões: RPM, TPM, RPD e **IPM**. **[DOC]** Os números por modelo **não são publicados na página** —
a doc manda olhar no próprio AI Studio. **[DOC]** Não invente números aqui.

**Vertex** vs AI Studio: Vertex tem limites mais altos, sem cláusula de compartilhamento de dados,
recursos enterprise (grounding, fine-tuning, residência de dados) e **SLA**. **[3P]** Quota se pede
no console do GCP, filtrando por
`aiplatform.googleapis.com/generate_content_requests_per_minute_per_project_per_base_model`. **[3P]**
Ressalva: modelos Gemini novos em PayGo Standard usam **throughput compartilhado por tier**, e não uma
quota fixa que você aumenta diretamente. **[3P]**

---

## 5. O que uma empresa pequena realmente consegue

**Vale falar com sales gastando dezenas de dólares/mês?**

Resposta honesta, e aqui a maior parte é **[MERCADO]**, não fato documentado:

- **Anthropic: não precisa de sales.** O aumento de limite é **self-serve** no Console
  ("Request rate limit increase") **[DOC]**, e os limites do Start tier para Haiku (1.000 RPM /
  2M ITPM) já são ordens de grandeza acima do que um SaaS de dezenas de dólares/mês consome. Vocês
  não vão encostar nesse teto tão cedo.
- **OpenAI: não adianta.** A subida de tier é automática por gasto acumulado **[DOC]**. Com dezenas
  de dólares/mês você fica em Tier 1/2 por muito tempo — e **Tier 1 = 5 IPM [3P]**, que é
  literalmente menos que um carrossel. Sales não vai atender esse ticket.
- **Google: pedir quota no Vertex é self-service** e não depende de relacionamento comercial.
  Nem sempre aprovado, mas não custa nada tentar. **[MERCADO]**
- **OpenRouter Enterprise: não é para essa faixa.** Preço sob consulta, SLA negociado. **[MERCADO]**
- **fal.ai: a exceção interessante.** A escada de concorrência é **automática por compra de
  crédito**, de 2 até 40 concorrentes, sem falar com ninguém. Só acima de 40 precisa de sales. **[DOC]**
  Para uma empresa pequena isso é o melhor desenho de todos: você compra headroom com cartão.

**Caminho realista para mais throughput e menos latência sendo pequeno:**

1. Escolher modelos mais rápidos e ajustar o dial de qualidade (custo zero, ganho imediato).
2. Ir para arquitetura assíncrona com feedback incremental (elimina timeout, muda a percepção).
3. Comprar headroom onde ele é **comprável com cartão** (fal.ai) em vez de negociável (OpenAI/OR).
4. Instrumentar os headers de rate limit para saber onde está o teto antes de bater nele.
5. Prompt caching para levantar o teto efetivo de texto (na Anthropic, cache read não conta ITPM).

---

## 6. RECOMENDAÇÃO PRÁTICA — em ordem

### 1º — Trocar o default de imagem e expor o dial de qualidade *(horas, custo zero)*

O post leva ~85s porque o default é `gpt-image-2` a 68s. Vocês já têm um modelo **3x mais rápido com
a mesma qualidade de pt-BR** no catálogo. **[MEDIDO-NOSSO]**

- Tornar `google/gemini-3-pro-image` (Nano Banana Pro, 23s) o **default** — ou pelo menos o default
  do caminho "rápido" e de carrossel, onde a latência multiplica por 4-6.
- Manter `gpt-image-2` disponível para quem prioriza margem, e testar `quality: "low"` nele: fontes
  externas indicam queda de **30-50x** no tempo de `high` → `low` **[3P]**, e vocês estão em
  `medium`. Medir `low` e `medium` lado a lado antes de decidir.
- Trade-off a decidir com número na mão: $0,053 → $0,139 por imagem. Num carrossel de 6 slides
  é $0,32 → $0,83. Vale cruzar com a tabela de créditos antes de flipar o default global.

**Ganho estimado: post de ~85s para ~40s. Carrossel proporcionalmente maior.**

### 2º — Testar `service_tier: "priority"` e ligar streaming de imagem *(um dia)*

- Mandar uma request para `/api/v1/images` com `service_tier: "priority"` e checar o campo
  `service_tier` da resposta. Se o OpenRouter repassar (OpenAI e Google **estão** na lista de
  provedores com tier **[DOC]**), é aceleração por parâmetro. Se não repassar, descobre-se em minutos.
- Consultar `GET /api/v1/models` e ver quais dos seus modelos de imagem têm `supports_streaming: true`.
  Onde tiver, ligar SSE e mostrar **imagem parcial** no `ActionCard` em vez de spinner. **[DOC]**
  Não reduz o tempo; reduz a sensação, que é metade da dor.
- Ligar auto-topup mantendo **$10-20 de saldo mínimo** — a doc do OpenRouter liga saldo baixo a
  expiração agressiva de cache de edge e portanto a mais latência. **[DOC]** É configuração, não código.

### 3º — Tornar a geração assíncrona com entrega incremental *(uma capacidade)*

Esta é a mudança estrutural, e resolve tanto latência percebida quanto a classe de bugs 504 que já
está comentada no código de vocês.

- Endpoint aceita o pedido, grava job, devolve na hora.
- Geração slide a slide fora do request.
- Front escuta **Supabase Realtime** e preenche conforme chega: slide 1 visível em ~25s em vez de
  tudo em ~85s.
- Retry por slide, sem refazer o carrossel.
- Bônus: remove a aposta contra o wall-clock que hoje impede usar `quality: "high"`.

### 4º — Só então avaliar fal.ai para imagem *(opcional, depois do 3º)*

Se depois dos passos 1-3 ainda faltar throughput em rajada, fal.ai é o encaixe: fila nativa +
webhook + retry automático + **concorrência que você compra com cartão** (2 → 40 automático). **[DOC]**
Texto continua no OpenRouter — o gateway está fazendo bem esse trabalho e a `AGENT_MODEL_CHAIN` já dá
fallback.

**Não fazer:** ir direto na OpenAI. Tier 1 = 5 IPM **[3P]**, menos que um carrossel. Seria regressão.

### 5º — Instrumentação e prompt caching *(contínuo)*

- Logar `retry-after` e, quando disponível, os headers de rate limit, para saber a que distância do
  teto vocês estão **antes** de bater.
- Prompt caching no texto: system prompt do agente + definições de tools + contexto de marca.
  Anthropic exige `cache_control` explícito. **[DOC]** Ganho: leitura a 0,1x **[DOC]** e — o mais
  importante — `cache_read_input_tokens` **não conta para ITPM** na Anthropic (exceto Haiku 3.5),
  o que levanta o teto efetivo de throughput. **[DOC]**
- Ao escalar tráfego, **rampar gradualmente**: a Anthropic documenta "limites de aceleração" que
  disparam 429 em pico brusco mesmo dentro do limite nominal. **[DOC]**

---

## 7. Buracos declarados (o que NÃO foi possível confirmar)

- **[INCERTO]** Limite de concorrência do OpenRouter para conta paga: não existe número público.
  Nem confirmação de que exista.
- **[INCERTO]** Números do SLA Enterprise do OpenRouter (uptime, tempo de resposta, créditos).
- **[INCERTO]** Se `service_tier` funciona no endpoint `/api/v1/images` do OpenRouter — a doc de
  imagem não menciona.
- **[INCERTO]** Quais modelos de imagem têm `supports_streaming: true`.
- **[INCERTO]** Se prompt caching reduz latência (a doc do OpenRouter só fala de custo).
- **[INCERTO]** Números exatos de RPM/TPM/IPM por modelo no Google AI Studio — a doc manda consultar
  o console.
- **[INCERTO]** Requisito de "dias desde o primeiro pagamento" nos tiers da OpenAI — a doc atual não
  menciona mais.
- **[3P, não [DOC]]** A tabela de IPM do gpt-image-2 por tier veio de blog de terceiro, não da doc
  oficial da OpenAI. Tratar como ordem de grandeza.

---

## Fontes

**OpenRouter**
- [Rate limits](https://openrouter.ai/docs/api-reference/limits)
- [Provider routing](https://openrouter.ai/docs/features/provider-routing)
- [Service tiers](https://openrouter.ai/docs/guides/features/service-tiers)
- [Prompt caching](https://openrouter.ai/docs/features/prompt-caching)
- [Image generation](https://openrouter.ai/docs/features/multimodal/image-generation)
- [Latency and performance](https://openrouter.ai/docs/guides/best-practices/latency-and-performance)
- [Enterprise offering (Zendesk)](https://openrouter.zendesk.com/hc/en-us/articles/47463454637723-What-does-OpenRouter-offer-for-Enterprise-customers)
- [Nano Banana Pro model page](https://openrouter.ai/google/gemini-3-pro-image-preview)

**Provedores diretos**
- [OpenAI — rate limits e usage tiers](https://developers.openai.com/api/docs/guides/rate-limits)
- [OpenAI — Priority Processing / Fast mode](https://developers.openai.com/api/docs/guides/priority-processing)
- [Anthropic — rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Gemini API — rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Vertex AI — quotas e system limits](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas)

**Provedores de imagem / gateways**
- [fal.ai — concurrency limits](https://fal.ai/docs/documentation/model-apis/concurrency-limits)
- [fal.ai — webhooks](https://docs.fal.ai/model-apis/model-endpoints/webhooks)
- [fal.ai — reliability / retries](https://docs.fal.ai/model-apis/model-endpoints/reliability)
- [Replicate — rate limits](https://replicate.com/docs/topics/predictions/rate-limits)

**Benchmarks e análises de terceiros (marcados [3P])**
- [LLM Router Latency Benchmark 2026 — Opper](https://opper.ai/blog/llm-router-latency-benchmark-2026)
- [OpenRouter Latency Benchmark — Markaicode](https://markaicode.com/benchmarks/openrouter-production-benchmark-latency/)
- [LLM Gateways Compared 2026 — Wavect](https://wavect.io/blog/llm-gateway-router-comparison-2026/)
- [GPT Image 2 rate limits — WaveSpeed](https://wavespeed.ai/blog/posts/gpt-image-2-rate-limits-2026/)
- [GPT-image-2 performance tuning — Apiyi](https://help.apiyi.com/en/gpt-image-2-api-performance-tuning-quality-size-guide-en.html)
- [fal.ai vs Replicate 2026 — Scopeful](https://www.scopeful.org/blog/fal-vs-replicate)
- [AI API latency comparison — ModelsLab](https://modelslab.com/ai-api-latency-comparison)
- [Fastest LLM API benchmark — DeployBase](https://deploybase.ai/articles/fastest-llm-api)
- [OpenRouter rate limits explained — DataStudios](https://www.datastudios.org/post/openrouter-rate-limits-explained-request-caps-free-model-limits-provider-quotas-scaling-issues)

**Interno**
- `supabase/functions/_shared/openrouter.ts` — medições de latência/custo pt-BR de 2026-07-31
- `supabase/functions/generate-slide-images/index.ts` — `quality: "medium"`, comentário sobre 504
