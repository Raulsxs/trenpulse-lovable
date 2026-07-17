# TrendPulse — Plano de Melhorias (Jul/2026)

Ranking impacto × esforço + status. Fonte: mapeamento docs×código + observações ao vivo (semana de 07–16/jul).

## Fase 0 — Proteção de receita (segurança) 🔴 PRIORIDADE
Exploits confirmados na auditoria. Sem isso, o modelo de créditos fura.

- [x] `generate-video` sem auth → debita crédito de userId arbitrário (roubo). Exigir service key.
- [x] `generate-slide-images` só checa prefixo Bearer → abuso de custo. Validar service key OU user JWT (getUser).
- [x] `render-slide-image` público → SSRF + escrita em storage. Validar auth.
- [x] `diag-vision` público executando IA → remover/undeploy.
- [x] `credit_pricing` gravável por qualquer um → ENABLE RLS (SELECT p/ todos, escrita só service_role).
- [x] Funções de crédito SECURITY DEFINER (`grant_credits`/`spend_credits`/`debit_credits`/`reset_monthly_credits`) → `REVOKE EXECUTE FROM anon, authenticated`.
- [x] `get_cron_users_due` concedida a anon (vaza WhatsApp/PII) → `REVOKE EXECUTE FROM anon, authenticated`.

## Fase 1 — Lançamento / cobrança (decisões do Raul)
- [ ] Ligar enforcement de crédito (`CREDITS_ENFORCED=true`) — decisão de lançamento.
- [ ] Trocar `ASAAS_PROD_KEY` pela key de produção — bloqueia cartão + lançamento.

## Fase 2 — Retenção (código pronto, expor)
- [ ] Calendário como herói (SPRINT 4): subir na sidebar, botão "Agendar" no ActionCard, nudges.
- [ ] Renderização progressiva do carrossel (122s→~30s percebido): create-early + polling.
- [ ] Lembretes/notificações reais ("hora de postar", saldo baixo, publicado) — email + in-app.

## Fase 3 — Robustez operacional (aprendizado da semana)
- [ ] Alertas de saldo baixo/health-check das dependências externas (PFM, Firecrawl, Jina, inference.sh).
- [ ] Smoke test do agente (links reais + asserts de formato/marca) — pega regressão antes do cliente.

## Fase 5 — Direção de produto (insight LocalStudio, 17/jul)
Inspirado no LocalStudio.dev (editor no browser, IA local, saída = camadas editáveis).
- [ ] **Camada de texto editável sobre a arte AI** (impacto 🔴, esforço Alto). Hoje geramos imagem
  CHAPADA (texto cozido no pixel) → raiz de quase todos os bugs (texto duplicado, acento em caixa
  alta, marca/conteúdo errado) e cada correção = regenerar (queima crédito). Se o texto for camada
  editável sobre o fundo AI, o usuário conserta sem gerar de novo. Ver `docs/spike-camada-editavel.md`.
- [ ] **IA de TEXTO no browser** (impacto 🟢 margem, esforço Médio, progressive enhancement). Legendas,
  hashtags, variantes por plataforma e **tradução bilíngue** rodariam no browser (Chrome Prompt/
  Translator API) onde suportado → custo marginal zero; fallback pra API. SÓ texto (imagem no browser
  não tem qualidade). Começar pela tradução bilíngue.

## Fase 4 — Crescimento
- [ ] Landing reposicionada + case Dr. Maikon (prova social) — precisa Raul.
- [ ] Onboarding self-serve completo (1ª marca/1ª geração assistida).
- [ ] Referral ("ganhe créditos") + reativar `FeatureGuide` (baixo esforço).
- [ ] Analytics real via Apify (Raul tem conta) — hoje aba escondida por não ter fonte.
- [ ] Vídeo IA — backend existe; expor DEPOIS do loop de retenção.

## Feitos nesta leva
- [x] Feature "Salvar + Reutilizar visual" (ActionCard + seção "Visuais salvos" na marca) — commit 9305f71.
- [x] Cadeia de bugs do link→conteúdo (Jina no-cache, extração, marca, formato) — vários commits.
