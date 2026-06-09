# Pesquisa: como transformar o TrendPulse em valor real para outros clientes

> Estudo feito em 2026-05-30 por 2 agentes de pesquisa (concorrência/posicionamento + novas capacidades de geração). Documento para retomar a discussão estratégica **depois** que os bugs de geração do Maikon estiverem corrigidos.

## Tese central (os dois relatórios convergem)

O TrendPulse não está estagnado porque a geração é ruim. Está estagnado porque **"digita prompt → sai post bonito" virou commodity** — Canva, mLabs (R$29), GalilAI (R$27) já fazem isso. O produto cobra no topo (Pro R$147,90) sem o moat que sustenta esse preço.

A saída não é gerar "mais bonito"; é:
1. **Criar o loop de hábito que falta** (calendário + agendamento + analytics).
2. **Cravar um vertical defensável** (saúde + compliance, com o Maikon de âncora).

---

## 1. Concorrência

### Brasil (campo de batalha real)

| Player | O que faz | Diferencial | Preço |
|---|---|---|---|
| **mLabs** | Incumbente: agendamento, relatórios, análise de concorrente, aprovação, IA texto+imagem+vídeo, 6 plataformas | 145k+ marcas, confiança, barato, workflow completo | R$29,90–49,90 |
| **Sorriai** | IA posts+vídeo **para dentistas**; auto-publish IG/FB/Google Business; calendário editorial mensal; roteiros de Story diários | **Vertical + filtro de compliance CFO-196** antes de publicar | R$79–249 |
| **GalilAI** | Posts IA imagem+legenda IG/FB, auto-publish | Preço mais baixo, zero setup | R$27,90 |
| **ClickPosts** | Templates prontos revisados por humano (sem IA gen) | Curadoria dentista + baixo risco | R$27,90–44,90 |

### Global (referências de feature)

- **Predis.ai** — posts, carrosséis, vídeo IA, análise de concorrente. Tier agência $249. Lock-in via scheduling.
- **Ocoya** — copy multilíngue (26 idiomas), all-in-one (scheduling, analytics, e-commerce).
- **Canva (Magic Studio)** — 25+ ferramentas IA no editor. Distribuição imbatível, switching cost enorme.
- **Taplio / Tweet Hunter** — LinkedIn/X growth + biblioteca viral + CRM. Sticky.
- **OpusClip / Submagic** — vídeo longo → clipes virais com legenda.
- **Buffer / Hootsuite / Sprout** — agendamento + analytics; calendário = hábito diário.
- **Publer / Vista Social / SocialPilot** — scheduling + white-label multi-cliente (agências).

---

## 2. O que falta no TrendPulse (table stakes)

1. **Calendário + agendamento + fila** ← **o maior buraco.** Publica mas não tem calendário → não vira hábito → o usuário gera 3 posts e some. Churn de SMB é 3–7%/mês; o antídoto comprovado é embedar no workflow.
2. **Analytics customer-facing** (hoje só existe o admin pro dono). No roadmap (Apify) — priorizar.
3. **Vídeo / short-form** — só imagem/carrossel. Cada vez mais table stakes, mas caro; não investir antes do calendário.
4. **Repurposing de verdade** (1 fonte longa → N posts nativos). Hoje só faz variantes de legenda.
5. **White-label / multi-cliente** (agências) — ausente. Lane de monetização.

Já à frente do GalilAI: sistema de brand context + photo-background mode. Apoiar nisso.

---

## 3. Onde dá pra vencer (diferenciação)

**Evitar (saturado):** "prompt → post genérico" e agendamento genérico (mLabs domina com 145k marcas).

**Atacar (mal-servido):**

1. **Vertical de saúde + moat de compliance — maior convicção.** Sorriai provou no Brasil (dentistas + CFO-196). O TrendPulse já tem o Maikon de âncora. Profissionais de saúde BR têm regras de publicidade duras (CFM/CRP/CFN/CFO) → um **filtro de linguagem compliant** é dor real e defensável que os genéricos ignoram. Some o photo-background mode (rosto + frase) = formato que coach quer.
2. **Locale (pt-BR + PIX).** Os fortes em inglês (Taplio, OpusClip, Buffer) são fracos em pt-BR e não aceitam PIX. Mas locale sozinho não basta — combinar com o vertical.
3. **Agência / white-label** no preço SMB BR. Social media managers com 5–20 clientes locais. ACV maior, churn menor. Exige calendário + colaboração primeiro.
4. **"Mês pronto autônomo".** Tendência 2026 é agente, não ferramenta: define guardrails, agente preenche o calendário. Arquitetura chat-first encaixa em "aprova o mês".

---

## 4. Novas ferramentas de geração (por valor/esforço)

| Capacidade | Ferramenta | Custo API | Encaixe |
|---|---|---|---|
| **Vídeo (Animar post→Reel)** | Kling 3.0 | ~$0,10/seg (~$0,50/clipe 5s) | Botão "Animar" **já existe** no ActionCard. Checar se inference.sh já expõe Kling/Veo. |
| **Avatar falante (faceless)** | HeyGen API | ~$1/min, API $108/mês | Lip-sync PT-BR. Coach vira talking-head sem filmar. |
| **Voz / voiceover** | ElevenLabs | $0,05–0,10/1k chars | Clonagem de voz do coach. Multiplicador do vídeo. |
| **Vídeo longo → clipes** | OpusClip API | por uso | "Cola link do YouTube → 5 Reels prontos". |
| **Memes IA** | Gemini bg + texto | ~grátis | Quick win viral. |

**Pular:** Synthesia (API só enterprise $899), Canva Connect (OAuth pesado), Bannerbear/Placid (redundante com Blotato). **Não voltar pro Satori** (degradava qualidade do fundo + posicionava texto em cima de rosto/fora da caixa).

---

## 5. Pricing / monetização

- **Âncora brutal no BR:** mLabs R$29–49, GalilAI R$27,90, Sorriai R$79–249. Pro a R$147,90/100 gens é difícil de justificar contra mLabs Completo (ilimitado + analytics, R$49,90) **sem** o valor vertical/compliance.
- **Modelos que retêm:** por-canal (Buffer), créditos por-uso (mapeia custo real), tier agência (maior ACV).
- **Retenção:** time-to-value nos primeiros 90 dias é o lever dominante (Sorriai entrega "3 peças prontas antes de cobrar"). ~40% do churn é involuntário (cartão falha) → **PIX recorrente** (já está no Asaas).
- **Mudança sugerida:** sair de "gens fixas/mês" → **créditos que mapeiam custo real** (imagem $0,076 vs vídeo vs legenda $0,001) + tier vertical "mês pronto compliant" (~R$199–299) + tier agência. Ancorar entrada perto do mLabs (~R$39–49).

---

## 6. Roadmap priorizado (síntese)

1. **Calendário + agendamento + analytics customer-facing** — loop de hábito. *Maior impacto na retenção.*
2. **Vertical saúde + camada de compliance** (playbook Sorriai aplicado ao Maikon) + re-precificar como "mês compliant".
3. **Kling "Animar"** (vídeo barato, botão já existe).
4. **HeyGen avatar** (faceless coach, PT-BR).
5. **ElevenLabs voz** (multiplicador do vídeo).
6. **OpusClip** (vídeo longo → clipes).

**Não fazer antes de #1 e #2:** vídeo, features de time, expansão pro mercado inglês — distração enquanto o loop de retenção não existe.

---

## Fontes

**Concorrência / mercado:**
- https://predis.ai/resources/predis-ai-vs-ocoya/ · https://www.softwareadvice.com/marketing/predis-ai-profile/
- https://apaya.com/blog/best-ai-social-media-tools · https://zapier.com/blog/best-ai-social-media-management/
- https://www.eesel.ai/blog/canva-ai-pricing · https://www.eesel.ai/blog/opusclip-pricing
- https://sorriai.com.br/blog/sorriai-vs-galilai-vs-clickposts · https://sorriai.com.br/precos · https://galilai.com.br/
- https://www.mlabs.com.br/blog/mlabs-planos
- https://genesysgrowth.com/blog/saas-churn-rates-stats-for-marketing-leaders · https://www.pendo.io/pendo-blog/user-retention-rate-benchmarks/
- https://www.admove.ai/blog/ai-agents-for-social-media-guide

**Capacidades de geração:**
- https://dev.to/andrew202510/why-every-ai-image-generator-fails-at-text-and-one-that-finally-doesnt-324c
- https://uxdesign.cc/lost-for-words-why-text-in-ai-images-still-goes-wrong-b5232c39bd11
- https://github.com/vercel/satori · https://docs.htmlcsstoimage.com/ · https://creatomate.com/pricing
- https://www.buildmvpfast.com/api-costs/ai-video · https://evolink.ai/blog/best-ai-video-generation-models-2026-pricing-guide
- https://www.heygen.com/api-pricing · https://apidog.com/blog/ai-talking-avatar-api/
- https://elevenlabs.io/pricing/api · https://elevenlabs.io/blog/elevenlabs-vs-cartesia
- https://www.opus.pro/
