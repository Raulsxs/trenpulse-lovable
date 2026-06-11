# Visão de produto — TrendPulse como plataforma de multigeração + publicação (2026-06-11)

> Análise da ideia do Raul: posicionar o TrendPulse como self-service de IAs de geração
> (imagem + vídeo, N modelos via inference.sh) mantendo as features de distribuição
> (marcas, templates, publicação em 9 redes, calendário), monetizado por margem de créditos.
> Companion de `plano-produto-trendpulse-2026.md` e `PROXIMA-SESSAO.md`.

---

## 1. O veredito honesto primeiro

**A ideia é boa — mas pelo motivo oposto ao óbvio.** "Mais um hub de modelos de IA" é
um mercado lotado de wrappers (fal.ai, Replicate, OpenArt, Krea, Freepik AI, Higgsfield)
competindo por preço, e a tese contrária da auditoria continua válida: geração avulsa
atrai turista que não paga.

O que muda o jogo na tua formulação é o **fim do funil**: todos esses concorrentes
**param na imagem gerada**. O usuário baixa o PNG e vai embora. O TrendPulse já tem o
que nenhum deles tem — o loop completo:

```
gerar (qualquer modelo) → aplicar marca → agendar → publicar em 9 redes → repetir
```

**Posicionamento certo: não "mais um gerador" — "o gerador que publica".**
- A multigeração é **aquisição**: "gerar imagem com IA" é um dos maiores volumes de
  busca do mundo; cada modelo novo (Kling, Veo, FLUX) é uma onda de tráfego.
- A distribuição (marca + calendário + 9 redes) é **retenção e moat**: é o motivo de
  ficar depois que a curiosidade passa. Wrapper não tem switching cost; calendário
  com 30 posts agendados tem.

## 2. A economia (a margem que você perguntou)

Sim — o modelo de créditos JÁ é margem sobre o custo de inferência. Hoje:

| Ação | Cobramos | Custa (inference.sh) | Margem |
|---|---|---|---|
| Post (gpt-image-2 medium) | 4cr ≈ R$0,38* | $0.024 ≈ R$0,13 | ~65% |
| Story (Nano Banana Pro) | 6cr ≈ R$0,57 | $0.15 ≈ R$0,82 | **negativa!** ⚠️ |
| Tweet card (Satori) | 2cr ≈ R$0,19 | ~zero | ~100% |

*\*no pack R$100 = 1050cr → R$0,095/cr.*

Aprendizados pra plataforma multi-modelo:
1. **Preço por modelo, não por formato.** A tabela `credit_pricing` já suporta (1 action
   por modelo). O story 9:16 via Nano Banana Pro hoje dá margem negativa — numa galeria
   de modelos isso fica transparente e correto: modelo premium custa mais créditos.
2. **Regra de pricing: custo do provider × 2.5–3.5 = créditos.** Mantém margem ~60-70%
   e absorve retries/falhas (que a gente paga e o usuário não vê).
3. **Vídeo é onde a margem escala**: clipes Kling/Hailuo custam $0.10–0.50 → cobrar
   30–150cr (R$2,85–14,25). Tíquete por geração 10-30x maior que imagem, mesma margem %.

## 3. Como eu idealizaria o produto

### A tela principal: Studio de geração (não chat-only)
- **Prompt box central** + anexo de imagem (img2img/referência).
- **Seletor de modelo** ao lado do prompt: cards com amostra visual, custo em créditos,
  tempo médio ("~15s" / "~90s") e "melhor para" (texto em pt-BR, fotorrealismo, anime,
  vídeo). É a estante de pincéis — a feature É a escolha.
- **Presets de formato**: Post 1:1 / Story 9:16 / Carrossel / Vídeo Reels — formato é
  preset, não decisão técnica de aspect ratio.
- **Toggle "Aplicar minha marca"**: injeta paleta/fontes/regras da marca em qualquer
  modelo (a infra de brand-as-context-injector já faz isso hoje).
- **Toda geração termina nas mesmas 4 ações**: [Publicar] [Agendar] [Baixar] [Refazer].
  O loop de distribuição embutido no resultado — é aqui que viramos produto e não wrapper.

### Galeria de modelos (a vitrine)
Página pública (SEO!) + interna: cada modelo com exemplos reais, custo, velocidade.
Lançamento de modelo novo = post de blog + e-mail = ciclo de aquisição recorrente grátis.
Curadoria enxuta no início: **3 de imagem + 2 de vídeo** (não 50 — paradoxo da escolha
e cada modelo tem quirks de integração que a gente sustenta, cf. wait:true/texto garbled).

### O que continua exatamente como está
- **Chat** vira "modo assistido" (e segue sendo a casa do white-glove/Maikon).
- **Calendário + publicação PFM**: já pronto, vira o coração da retenção.
- **Templates virais** (tweet card, editorial): viram atalhos de prompt+modelo na galeria.
- **Créditos + PIX**: o sistema de billing atual serve sem mudar NADA — só ganha linhas
  novas na credit_pricing.

### Landing page
- **Hero**: "Os melhores geradores de imagem e vídeo do mundo. Um saldo de créditos.
  Publicação automática nas suas redes." Sub: "Gere com FLUX, GPT-Image, Kling e mais —
  aplique sua marca e agende o mês inteiro."
- Demo central: galeria de modelos gerando a MESMA cena (mostra a diferença entre
  modelos — conteúdo hipnótico e único nosso).
- Seção "do prompt ao feed": gerar → marca → calendário → publicado (o loop).
- Pricing: os packs de créditos atuais (já reescritos no Sprint 2) + tabela "quanto
  custa cada modelo".
- Prova social: case Maikon (autoridade) + contador de posts publicados.

## 4. Gap analysis — o que já temos vs o que falta

| Peça | Status |
|---|---|
| Créditos prepagos + PIX + enforcement | ✅ pronto (Sprint 2) |
| inference.sh integrado | ✅ 2 modelos de imagem (gpt-image-2, Nano Banana Pro) |
| Geração livre (FREE_IMAGE) | ✅ existe — é o embrião do Studio |
| Marca como contexto | ✅ pronto |
| Calendário + publicação 9 redes | ✅ pronto e battle-tested |
| Templates próprios (tweet/editorial, Satori) | ✅ prontos |
| Seletor de modelo (front + roteamento) | ❌ não existe |
| Pricing por modelo | ❌ (1 linha de migration por modelo) |
| Vídeo (qualquer modelo) | ❌ zero — e publicação de vídeo via PFM não testada |
| Studio UI | ❌ hoje é chat-first |
| Galeria de modelos (pública/interna) | ❌ |
| Landing multigeração | ❌ |

**Leitura:** ~70% da plataforma já existe. O que falta é majoritariamente FRONT +
roteamento de modelo — não infra nova.

## 5. Riscos (anti-alucinação)

1. **Comparação de preço**: usuário avançado compara com fal.ai direto e nos acha caros.
   Defesa: não vender geração, vender o workflow; o avançado não é o ICP.
2. **Turista de IA**: geração avulsa atrai quem queima welcome credits e some. Defesa:
   welcome 50cr + empurrar agendamento/conexão de rede na primeira sessão (o nudge já existe).
3. **Custo de manutenção por modelo**: cada modelo tem quirks (já vivemos: wait:true,
   texto pt-BR garbled, 422 quota). Curadoria enxuta + tier "experimental".
4. **Vídeo via PFM**: publicar Reels/TikTok por API tem regras próprias — validar ANTES
   de vender vídeo na landing.
5. **Conflito com o ICP saúde?** Não: a plataforma horizontal é o PRODUTO, o vertical
   saúde (case Maikon) continua sendo o GTM/canal. Não são excludentes — landing
   horizontal + página de use-case vertical.

## 6. Sequência proposta (não atropela o lançamento)

**Regra de ouro: o lançamento atual (Horizonte 1) NÃO espera essa visão.** Billing,
onboarding e landing de créditos prontos servem identicamente pros dois posicionamentos.

- **F0 — validação (1 sessão):** escolher 3 modelos img + 2 vídeo no inference.sh;
  testar cada um (qualidade pt-BR, latência, custo real); definir credit_pricing por
  modelo; testar publicação de VÍDEO via PFM ponta a ponta.
- **F1 — seletor de modelo no chat (menor caminho pro valor):** dropdown de modelo no
  ChatInput pro FREE_IMAGE/GENERATE + roteamento por modelo no generate-slide-images
  (o hybrid routing atual já é a metade disso) + linhas na credit_pricing.
- **F2 — Studio UI:** tela de geração (prompt + seletor + presets + 4 ações) como rota
  nova ao lado do chat. `/impeccable` na veia.
- **F3 — vídeo:** Kling (ou Hailuo) via inference.sh → ActionCard de vídeo → publicar
  Reels/TikTok via PFM. Substitui o "Animar" do Blotato com margem nossa.
- **F4 — galeria pública + landing nova:** SEO play + reposicionamento.

## 7. Decisões que precisam do Raul antes da F0
- [ ] Confirmar posicionamento: horizontal (multigeração+publicação) como produto,
      vertical saúde como GTM — ou manter foco vertical e essa visão como Horizonte 3?
- [ ] Budget de teste F0 (~$5-10 de inference pra avaliar modelos de vídeo).
- [ ] Ordem: F1 antes ou depois do lançamento do Horizonte 1? (Recomendo: lançar
      primeiro — F1 chega em dias, não semanas, e o billing já cobra qualquer modelo.)
