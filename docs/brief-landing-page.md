# Brief — Landing Page do TrendPulse

> Documento para o agente que vai construir/reformular a landing. Objetivo: converter visitante em signup e ter **potencial viral**. Fonte: código real do produto + posicionamento (`melhorias-posicionamento-bestcontent.md`, `pesquisa-evolucao-produto-2026.md`).
> **Regra de ouro:** só destacar o que EXISTE hoje (seção "Funcionalidades reais"). Não prometer vídeo/analytics como prontos.

---

## 1. O que é o TrendPulse (posicionamento)

**Uma frase:** "Seu social media com IA — você digita o que quer, ele cria no estilo da SUA marca, agenda e publica em todas as redes."

**Parágrafo:** TrendPulse é um assistente de conteúdo para redes sociais. Diferente de um Canva (você monta) ou de um ChatGPT (texto solto), aqui você **conversa** com um agente que entende a identidade visual da sua marca e devolve **conteúdo visual pronto pra publicar** — posts, carrosséis, stories, tweet-cards — já com legenda, hashtags e no seu estilo. Depois agenda no calendário e publica em 9 plataformas. É o operador de social media que o profissional/pequena empresa não tem.

**O "porquê agora":** criar conteúdo consistente é caro (agência) ou toma tempo (fazer sozinho). IA resolve a criação, mas o gap real é **consistência de marca + distribuição** — é aí que o TrendPulse ganha.

---

## 2. Público-alvo (ICP)

- **Primário — profissionais de saúde** (médicos, dentistas, coaches de saúde). Âncora real: **Dr. Maikon Madeira** (cirurgia cardíaca / coach). É o vertical-moat: eles têm autoridade, precisam de presença digital e não têm tempo/equipe.
- **Secundário:** consultores, infoprodutores, pequenos negócios e criadores solo que precisam postar com regularidade e manter identidade visual.
- **Dor central:** "sei que preciso postar toda semana, mas não tenho tempo, equipe, nem consistência visual — e o que eu faço no Canva/ChatGPT sai genérico e sem a minha cara."

> Recomendação: a landing pode ter um **ângulo de saúde** em destaque (headline/prova social), já que é onde temos case real e diferenciação.

---

## 3. Proposta de valor / ângulos de venda

Três pilares (use como blocos de benefício):

1. **No SEU estilo, não genérico** — o agente aplica a identidade da sua marca (paleta, tipografia, tom, referências) em tudo. Consistência de marca automática.
2. **Da ideia ao publicado, num lugar só** — gera + agenda + publica em 9 redes. Sem pular entre 5 ferramentas.
3. **Rápido de verdade** — conversa curta → conteúdo pronto. De um **link de notícia/artigo** vira um carrossel do assunto. De um tema, um post.

Ângulo emocional: "recupere seu tempo e apareça com autoridade, sem virar designer nem social media."

---

## 4. Funcionalidades reais (o que EXISTE hoje — pode mostrar)

- **Geração por chat (o "Assistente"):** pede em linguagem natural → recebe o conteúdo pronto (imagem + legenda + hashtags).
- **Formatos:** post (feed), **carrossel** (multi-slide), **story** (9:16), **tweet-card** (estilo X/Twitter em imagem), **carrossel editorial** (estilo revista/cinematográfico).
- **Marcas (Brand Kit):** cada usuário cria marcas com paleta, fontes, tom, regras e **imagens de referência** que a IA copia o estilo. Modos: copiar estilo de referências, **foto pessoal como fundo** (ótimo pra médico: foto + frase), ou criar do zero.
- **Link → conteúdo:** cola um link de artigo/notícia → vira post ou carrossel sobre o tema, no estilo da marca.
- **Estúdio multi-modelo:** escolha do modelo de imagem (qualidade/estilo) — gpt-image, nano-banana, seedream, etc. (mostrar como "vários motores de imagem premium").
- **Publicação multi-plataforma (9 redes):** Instagram, LinkedIn, TikTok, X, Facebook, Pinterest, Bluesky, Threads, YouTube — via uma conexão. Legendas adaptadas por rede.
- **Calendário + agendamento:** arrasta pro dia, agenda horário, **agendamento recorrente** (dias/horários fixos). Publica sozinho na hora.
- **Salvar + reutilizar visual:** curtiu um visual? Salva e reusa o estilo em conteúdos futuros.
- **Créditos pré-pagos:** modelo de créditos (recarga via **PIX** e cartão) — paga pelo que usa.

**⚠️ NÃO destacar como pronto (em construção / desligado):**
- Vídeo IA (backend existe, mas está "em breve" no produto).
- Analytics/métricas reais (aba escondida hoje — sem fonte ativa).
- Não citar Blotato/templates (removido).

---

## 5. Diferenciais competitivos (por que não Canva/ChatGPT/Postermywall)

| vs | Diferencial do TrendPulse |
|---|---|
| Canva | Você não monta nada — o agente cria pronto, no seu estilo, e ainda agenda/publica. |
| ChatGPT / Gemini | Não é texto solto: sai a **arte pronta** + legenda + hashtags + distribuição. |
| Ferramentas de agendamento (Buwriter/Postgrain) | Elas só agendam; aqui **cria E agenda E publica** — o ciclo inteiro. |
| Agência | Fração do custo, na hora, sem depender de terceiro. |

**Frase-âncora de diferenciação:** "Não é mais uma ferramenta de IA. É o social media que trabalha no estilo da sua marca."

---

## 6. Estrutura sugerida da landing (seções + objetivo)

1. **Hero** — headline + subheadline + CTA + demo/mockup animado. Objetivo: entender o valor em 5s.
   - Headline candidata (saúde): *"Sua autoridade nas redes, sem virar social media."*
   - Alternativa (ampla): *"Você descreve. A IA cria no estilo da sua marca, agenda e publica."*
   - CTA primário: "Criar meu primeiro post grátis" (ver ganchos §7).
2. **Prova social** (logo abaixo do hero — hoje é ZERO, é o maior buraco): case Dr. Maikon + depoimento + números reais (ex.: "X posts gerados", tempo economizado). Ver §8.
3. **Como funciona (3 passos):** 1) descreva/cole um link → 2) IA cria no seu estilo → 3) agende e publique. Já existe `HowItWorks.tsx`.
4. **Demonstração / wow** — o momento viral (ver §7): demo interativa ou vídeo curto do agente criando + agendando.
5. **Vitrine de resultados** (`ResultGallery.tsx` já existe) — grade de peças reais geradas. **Curar exemplos de saúde/nicho**, não só tech.
6. **Funcionalidades** (`FeatureShowcase.tsx`) — os 3 pilares do §3 + os formatos + multi-plataforma.
7. **Diferenciais** (tabela do §5, versão visual).
8. **Preços** (`PricingSection.tsx`) — modelo de créditos, âncora de valor (comparar com custo de agência/tempo).
9. **FAQ** — objeções (funciona pro meu nicho? preciso saber design? posta sozinho? é seguro?).
10. **CTA final** + rodapé.

---

## 7. Ganchos de viralização (o mais importante deste brief)

Landing "normal" converte; landing **compartilhável** cresce sozinha. Mecanismos concretos, do mais forte ao complementar:

1. **Demo interativa no hero ("prove antes de assinar"):** um campo "digite um tema" → gera 1 preview de post ao vivo (com marca d'água TrendPulse). É o momento "uau" e a maior alavanca de conversão E de compartilhamento (a pessoa printa/compartilha o resultado). *Pode usar um fluxo limitado/sem login com rate-limit.*
2. **Ferramenta grátis como isca (lead magnet):** "Gerador grátis de post" ou "Transforme qualquer link em carrossel — grátis". Entrega valor real sem cadastro, resultado sai com marca d'água → **distribuição orgânica**. Converte pra signup quando quer salvar/publicar.
3. **Resultado compartilhável por design:** toda peça de exemplo/gerada tem uma assinatura discreta "feito com TrendPulse" → quem vê pergunta "como fez isso?".
4. **Antes/depois e velocidade:** "de um link → carrossel pronto em 30s" (gif/vídeo). Mostrar a MESMA marca gerando 6 peças consistentes de uma vez — o "consistência automática" é visualmente impressionante.
5. **Prova social de nicho:** "feito pra médicos" com o case Maikon — específico converte e é compartilhado dentro da bolha (grupos de médicos).
6. **Referral ("ganhe créditos indicando"):** mecânica de indicação já está no roadmap — a landing deve ter o gancho ("indique e ganhe créditos"). Loop de crescimento barato.
7. **Waitlist/urgência (se pré-lançamento):** ou "comece grátis agora" (sem fricção) se já aberto.
8. **Copy que gera print:** frases fortes e memáveis ("Seu social media não tira férias", "Pare de sumir das redes"). Headlines pensadas pra virar screenshot.

> Ordem de prioridade pra o agente: **#1 (demo interativa)** e **#2 (ferramenta grátis)** são os que mais movem o ponteiro de viral+conversão. Se tiver que escolher UM, é a demo interativa no hero.

---

## 8. Prova social — case Dr. Maikon (usar com aprovação dele)

- Quem: **Dr. Maikon Madeira** — cirurgião cardíaco / coach de saúde. Usa o TrendPulse pra criar carrosséis educativos e posts de autoridade (ex.: casos clínicos, IA na cardiologia).
- Ângulo do depoimento: "não tenho tempo nem equipe; agora mantenho presença consistente no meu estilo".
- Formato: foto + nome + especialidade + 1 frase forte + (ideal) 1 print de carrossel real dele.
- **Importante:** pedir autorização do Maikon antes de usar nome/imagem. É prova social nº1 e hoje a landing tem ZERO — priorizar conseguir isso.

---

## 9. Tom de voz + direção visual

- **Tom:** direto, confiante, sem jargão de IA. Fala do BENEFÍCIO (tempo, autoridade, consistência), não da tecnologia. Português BR.
- **Visual:** moderno, limpo, com bastante **demonstração visual** (a arte gerada é o produto — mostrar muito resultado). Evitar "cara de ferramenta de dev". Sensação premium mas acessível.
- Deixar a **arte gerada falar** — a landing é uma vitrine dos resultados.

---

## 10. Anti-goals (o que NÃO fazer)

- Não prometer vídeo IA nem analytics como prontos (§4).
- Não usar linguagem que superpromete ("100% automático, nunca erra") — o produto é ótimo em design/texto curto, arriscado em fotorrealismo complexo; a landing não precisa entrar nisso, mas não prometer o impossível.
- **Compliance saúde:** no vertical médico, evitar promessas de resultado clínico ou linguagem que sugira conselho médico. Foco em "presença/autoridade/conteúdo educativo", não em "capte pacientes garantido".
- Não impersonar terceiros nem usar logos de redes de forma que sugira parceria oficial inexistente.

---

## 11. Assets e código já existentes (reaproveitar, não recriar)

- **Landing atual:** `src/components/landing/TrendPulseLanding.tsx` (rota `/` via `Index`). Sub-componentes: `ChatMockup.tsx`, `HowItWorks.tsx`, `FeatureShowcase.tsx`, `ResultGallery.tsx`, `PricingSection.tsx`.
- **Exemplos reais de peças:** `public/showcase/` (posts de vários modelos: gpt_post, nano_editorial, nano_story, seedream_post…) e `landing-examples/` (post_copa, post_g7, tweet_gestao…). Usar na vitrine.
- **Stack:** React + Vite + TypeScript + Tailwind + shadcn/ui. Deploy Vercel (push na main).
- **Preços (referência atual, confirmar com Raul):** modelo de créditos pré-pagos (PIX + cartão). Free com créditos de boas-vindas.

---

## 12. Métrica de sucesso da landing

- Primária: **taxa de signup** (visitante → conta criada).
- Secundária/viral: uso da demo/ferramenta grátis, compartilhamentos, indicações (referral).
- North star do produto por trás: signup → 1ª marca → 1º conteúdo → 1ª publicação agendada (o "aha" é publicar, não só gerar).

---

### Resumo de 1 parágrafo pra colar no prompt do agente
> Construa a landing do TrendPulse — assistente de IA que cria conteúdo social (posts, carrosséis, stories, tweet-cards) no estilo da marca do usuário, agenda e publica em 9 redes. ICP: profissionais de saúde (case Dr. Maikon) + criadores/pequenos negócios. Diferencial: não é Canva (você não monta) nem ChatGPT (texto solto) — sai arte pronta + legenda + distribuição. Priorize um HERO com **demo interativa** (digite um tema → vê um post nascer, com marca d'água) e uma **vitrine de resultados reais** — são os maiores ganchos de conversão e viralização. Prova social do Maikon no topo. Tom: benefício (tempo/autoridade/consistência), não tecnologia. NÃO prometa vídeo/analytics (em construção). Reaproveite `src/components/landing/*` e os exemplos em `public/showcase/` e `landing-examples/`.
