# TrendPulse — Melhorias de Posicionamento & Produto

> Cruzamento competitivo com **BestContent AI** + ideias de produto. 2026-06-28.

## 0. Tese central

O BestContent joga **largo, freemium e viral** ("o sistema operacional do seu marketing"): wizard de criação + comunidade + gamificação + agência. A TrendPulse joga **profundo e premium**: operador **agêntico** de social media + **fidelidade de marca** (âncora + style_guide) + white-glove.

**Não copiar o "largo/freemium" de cara.** A estratégia é: **dobrar no diferencial** (chat agêntico + fidelidade) **e roubar os mecanismos baratos e provados de descoberta, engajamento e retenção** que o concorrente já validou.

---

## 1. Posicionamento — onde cada um joga

| | BestContent AI | TrendPulse |
|---|---|---|
| Pitch | "Crie conteúdo com inteligência. Nós cuidamos do resto." / SO do marketing | Operador agêntico que cria no estilo da sua marca, agenda e publica |
| Interação | **Wizard** (escolhe tipo de card → preenche) | **Chat agêntico** (pede em linguagem natural) |
| Marca | logo/cores/voz aplicados; style guide **visível e editável** | fidelidade alta (âncora + style_guide) — porém hoje **escondido** |
| Modelo | Freemium → Pro (créditos/agendamento/analytics gated) | Créditos prepagos (PIX) |
| Motor de crescimento | comunidade + ranking + referral | — (oportunidade) |
| Extras | Blog/SEO, Link na bio, Academy, Modo Agência | — |

**Conclusão:** o produto deles é mais "rede de criadores + ferramenta"; o nosso é mais "consultor que executa". Nosso diferencial defensável é a **conversa + fidelidade**. Onde estamos atrás é em **descoberta de recursos, prova de capacidade e ganchos de retenção**.

---

## 2. O que o BestContent tem que vale trazer (priorizado)

| Feature | O que é | Valor pra Trend | Esforço |
|---|---|---|---|
| **Showcase modals** (feature discovery) | modal de "novidade/recurso não explorado" com exemplo real | 🟢 alto — prende, ensina o que a ferramenta faz | baixo |
| **Vitrine de exemplos** | galeria do que dá pra gerar (posts, carrosséis, tweet, story, vídeo) | 🟢 alto — descreve a capacidade pro público | baixo-médio |
| **Billing recorrente** (cartão + créditos mensais inclusos) | assinatura mensal com créditos + features | 🟢 alto — MRR previsível | médio |
| **Modo Agência** (multi-cliente) | operador gerencia várias marcas num painel | 🟢 alto — encaixa na **Pulse ID** (delegação/clientes) | médio-alto |
| **Gamificação** (XP, streak, missões, ranking) | progresso + missões diárias + ranking mensal | 🟡 médio — retenção | médio |
| **Referral** ("ganhe créditos") | indicação dá créditos | 🟡 médio — crescimento viral barato | baixo |
| **Pautas / datas comemorativas** | planejamento de temas + datas automáticas | 🟡 médio — recorrência de uso | médio |
| **Inspiração / trends** | feed de ideias/tendências | 🟡 médio (já temos scrape-trends) | médio |

---

## 3. Ideias-chave do Raul (detalhadas)

### 3.1 Modais de descoberta de recurso — "teste como tweet" ⭐
Modal aparecendo **de vez em quando** mostrando um recurso **não explorado** pelo usuário, **com um exemplo real renderizado na frente dele**. Ex.: *"Sabia que isso vira um tweet-card? Olha como ficaria:"* + exemplo pronto.

- **Por que prende:** feature discovery + **prova visual**. Mata o "não sei o que a ferramenta faz".
- **Como:** componente `FeatureSpotlight` + tabela `feature_showcases` (recurso, exemplo pré-gerado, CTA). Regra de exibição: 1x por sessão, só recursos **ainda não usados** pelo usuário, com exemplo real. Dispara ao concluir uma geração ("já que você fez um post, experimenta vídeo →").
- **Detalhe de usabilidade que prende um público** (palavras do Raul): o exemplo real na frente > descrição textual.

### 3.2 Vitrine de exemplos — descrever o que a Trend gera
Galeria curada de exemplos reais (post, carrossel, tweet-card, story, **vídeo animado**) que comunica as capacidades. Inspirada na "comunidade" do BestContent, mas **curada** (não social). Entra na landing + dentro do app (empty states, onboarding).

### 3.3 Billing — recorrência + créditos mensais + PIX
- **Hoje:** créditos prepagos via Asaas **PIX** (compra avulsa).
- **Adicionar:** **assinatura recorrente no CARTÃO** (mensal) com **créditos mensais inclusos** + features (agendamento, analytics). O usuário "assina" em vez de só comprar avulso.
- **Manter:** compra avulsa via **PIX**.
- **Por que:** recorrência = MRR previsível; créditos inclusos = âncora de valor; cartão = menos fricção mês a mês. (Asaas suporta assinatura recorrente em cartão.)

### 3.4 Modo Agência (Pulse ID)
Multi-cliente: o operador (ex.: Felipe) gerencia várias marcas/clientes num painel único, com troca rápida de contexto. Encaixa direto no modelo operacional Pulse ID (delegação, clientes). O BestContent tem "Minha Agência" — validado.

---

## 4. Melhorias de posicionamento na landing da TrendPulse

1. **Headline do diferencial** — deixar claro "operador agêntico que cria no estilo da SUA marca e publica" (não mais um gerador de imagem).
2. **Vitrine de exemplos** logo no topo (o que ele vai conseguir gerar — incluindo **vídeo animado**).
3. **Prova de fidelidade de marca** (antes/depois: referências → conteúdo no mesmo estilo).
4. **Loop completo visível**: gerar → marca → agendar → publicar (o moat).
5. **CTA de teste** (freemium/créditos grátis) pra reduzir fricção de entrada.

---

## 5. Vídeos animados (Grok) — direção do produto

Vídeos como **estilo de criação a partir de título / reportagem / exemplo** — **animação explicativa sobre o ASSUNTO**, podendo **seguir a marca ou ser livre**. **Nada de avatar, perfil ou pessoa** — motion graphics que explicam um tema (ex.: Maikon explicando assunto médico). Modelo: `xai/grok-imagine-video` no Replicate ($0.05/s, 1-15s, text-to-video e image-to-video). Detalhe de implementação no backlog técnico.

---

## 6. Priorização sugerida (ordem de ataque)

1. **Vídeos Grok** (capacidade nova, alto apelo, já mapeado) — em construção.
2. **Showcase modals** + **vitrine de exemplos** (baixo esforço, alto efeito de retenção/descoberta).
3. **Billing recorrente** (cartão + créditos mensais inclusos; manter PIX) — MRR.
4. **Modo Agência** (Pulse ID).
5. **Gamificação + referral** (retenção + viral).
6. **Pautas / datas comemorativas / inspiração**.

> Onde a Trend **ganha e deve dobrar a aposta**: chat agêntico (eles são wizard), fidelidade de marca (âncora + style_guide que acabamos de ligar), white-glove.
