# Arquitetura — MCP do TrendPulse

**Capacidade:** deixar o Claude e o Codex operarem o TrendPulse de dentro da sessão do usuário —
mandar a arte que o agente acabou de criar pro calendário, agendar, listar marcas e contas, checar
saldo — sem que a pessoa saia pra outra aba.

**Estado:** proposta. Nada implementado além da Fase 1.
**Origem:** reunião Raul × Dr. Maikon, 2026-09-06.

---

## 1. O problema real, na fala do usuário

O Maikon já cria arte no Claude/Codex hoje. Ele mostrou na reunião um calendário inteiro de posts
gerado por lá, com fotos de evento. O que trava é a última milha:

> "eu queria, tipo assim, jogar essas imagens lá pro Trend (…) jogar todas essas artes lá no Trend e
> ele postando, tipo assim, segunda, quarta e sexta"

E o contexto que dá tamanho ao problema: ele tem **oito a dez empresas** (GSS, Agis, MediFlux,
Dr. Escala, Dr. Oportunidade, Jornada, HeartSurg, Hemodinâmica…), quase nenhuma com marketing, e
quer deixar três artes por semana agendadas até janeiro em cada uma. Fazer isso na mão, marca por
marca, é o que não acontece hoje.

Um pedido secundário, mas que define o desenho: **ele quer aprovar antes de publicar.**

> "eu acho que teria que ter alguma coisa lá dentro de eu aprovar a semana"

Ou seja: o MCP agenda como RASCUNHO aprovável, não dispara direto pra rede.

---

## 2. O que já existe (verificado no código e no banco)

| Peça | Onde | Serve pro MCP? |
|---|---|---|
| `generated_contents` com `scheduled_at`, `status`, `image_urls`, `caption`, `brand_id` | tabela | sim, é o destino da arte |
| `instagram-scheduler` | edge function (cron) | sim — já publica o que está `status='scheduled'` e vencido |
| `publish-postforme` | edge function | sim — publica um `contentId` nas redes |
| `connect-social` | edge function | sim — lista contas, consultando a API do Post for Me direto |
| `brands` (`owner_user_id`, `name`) | tabela | sim |
| `user_credits` / `spend_credits` | tabela + RPC | sim — cobrança tem que valer igual pelo MCP |
| Buckets `content-images`, `generated-images` (públicos) | storage | sim, é onde a arte enviada vai parar |

**O que NÃO existe, e é o bloqueio real:** nenhuma superfície de API pra terceiros. Toda edge
function exige JWT de sessão do Supabase, que expira e não é revogável por aplicação. Não há
conceito de token de usuário no banco (só `profiles.gemini_api_key`, que é outra coisa).

Isso é o que decide a ordem das fases: **sem credencial de longa duração, nenhum MCP funciona.**

---

## 3. A solução desenhada

### 3.1 Decisão central: API primeiro, transporte depois

O servidor MCP é uma casca fina. O que precisa existir é uma **API autenticada por token pessoal**.
Fazendo nessa ordem, a escolha de transporte (abaixo) deixa de ser bloqueante — os dois consomem a
mesma API.

### 3.2 Autenticação: Personal Access Token

- Tabela `api_tokens`: `token_hash` (SHA-256, nunca o token cru), `user_id`, `name`, `scopes[]`,
  `last_used_at`, `revoked_at`, `expires_at`.
- O token aparece **uma vez** na tela, no ato da criação. Depois só o hash existe.
- Prefixo `tp_pat_` + 32 bytes de `gen_random_bytes` (pgcrypto — nunca `random()`, que não é
  criptográfico).
- Verificação por hash, com `last_used_at` atualizado — é o que permite ver token esquecido e
  revogar.
- **Escopos desde o começo**, não depois: `read`, `schedule`, `generate`, `publish`. O MCP do Maikon
  pede `read` + `schedule` + `generate`; `publish` (disparo imediato) fica de fora por padrão,
  porque publicar sem revisão é o oposto do que ele pediu.

### 3.3 Transporte: stdio via `npx`, na v1

Duas opções reais:

| | stdio (`npx @trendpulse/mcp`) | remoto (HTTP streamable) |
|---|---|---|
| Claude Desktop | sim | sim |
| Codex CLI | sim | parcial |
| Instalação | precisa de Node na máquina | nenhuma |
| Config | um bloco JSON | uma URL + token |

**v1 = stdio.** Funciona igual nos dois clientes que o Maikon usa, e o custo de config (um bloco
JSON que o Raul cola pra ele) é menor que o risco de o remoto não fechar no Codex. O remoto entra
depois, reusando a mesma API — e aí sim vira o caminho pra usuário self-serve.

### 3.4 As ferramentas (o que o agente enxerga)

A que resolve o problema do Maikon vem primeiro:

1. **`agendar_arte`** — recebe imagem (base64 ou URL), legenda, data/hora, marca e redes. Sobe pro
   bucket, cria `generated_contents` com `status='scheduled'`, devolve o id e o link do calendário.
   É esta que transforma "16 artes no Claude" em "16 posts agendados".
2. **`listar_marcas`** — o agente precisa saber em qual das dez empresas está mexendo.
3. **`listar_contas`** — quais redes estão conectadas em cada marca.
4. **`ver_agenda`** — o que já está agendado num intervalo. Sem isto o agente agenda em cima do que
   já existe.
5. **`gerar_conteudo`** — gera pela plataforma (cobra crédito, respeita a marca). Para quem quer a
   identidade visual da marca em vez da arte crua do modelo.
6. **`consultar_saldo`** — para o agente parar antes de tentar gerar sem crédito.

`publicar_agora` fica FORA da v1, por decisão de produto: o pedido explícito foi aprovar antes.

### 3.5 Cobrança

`agendar_arte` com imagem pronta **não cobra crédito** — não gerou nada, só guardou e agendou.
`gerar_conteudo` cobra o mesmo que o app cobra, pelo mesmo `spend_credits`. Qualquer caminho
alternativo de cobrança aqui viraria buraco de margem.

---

## 4. Fora de escopo (v1)

- **Publicação imediata** (`publicar_agora`) — o usuário pediu aprovação antes; entra só se ele pedir.
- **Transporte remoto/HTTP** — depois da v1 stdio, reusando a mesma API.
- **OAuth** — PAT resolve; OAuth só faz sentido quando houver terceiros de verdade.
- **CRM, tarefas, financeiro, gestão de cirurgias** — tudo isso apareceu na mesma reunião, mas é
  outro produto (o CRM do Maikon), não o TrendPulse. Não misturar.
- **Criação de marca pelo MCP** — o wizard de marca é multi-etapa e visual; expor pelo MCP na v1
  entregaria marca meia-boca. Listar sim, criar não.
- **Vídeo/Reels** — mencionado na reunião, mas depende do repricing de vídeo que está pendente.

---

## 5. Riscos

1. **Token vazado = conta operável por terceiro.** Mitigação: escopos, revogação na UI,
   `last_used_at` visível, e `publish` fora do escopo padrão. Sem isso, um token no `claude.json` de
   uma máquina compartilhada vira postagem indevida no perfil de um médico.
2. **O agente agenda em cima de post existente.** Mitigação: `ver_agenda` obrigatório no fluxo, e
   `agendar_arte` recusa quando já há conteúdo no mesmo horário exato.
3. **Imagem grande estourando a edge function.** A geração já bateu no teto de memória antes (o bug
   do `logo-overlay`). Mitigação: limite de tamanho explícito no upload e erro claro, não timeout.
4. **Maikon tem 0 contas sociais conectadas hoje** (verificado). O MCP vai agendar num vazio se ele
   não conectar antes. Mitigação: `listar_contas` retorna aviso explícito quando vier vazio, e a
   config entregue pra ele vem junto com o passo de conectar.
5. **Fuso horário.** Ele opera em SC, Goiânia, BH e Rio. Agendar em UTC sem dizer isso gera post às
   3h da manhã. Mitigação: a API aceita e devolve horário com fuso explícito.
6. **npm scope `@trendpulse`** pode não estar registrado. Verificar antes da Fase 3.

---

## 6. Plano de execução

- [x] **1. PAT — schema e verificação.** Tabela `api_tokens`, geração com `gen_random_bytes`, helper
      `requirePat()` com escopos, RLS fechada.
- [ ] **2. PAT — UI.** Tela no Perfil: criar (token aparece uma vez), listar, revogar, ver último uso.
- [ ] **3. `mcp-api` — leitura.** `listar_marcas`, `listar_contas`, `ver_agenda`, `consultar_saldo`.
- [ ] **4. `mcp-api` — escrita.** `agendar_arte` (upload + `generated_contents` + `scheduled_at`).
- [ ] **5. `mcp-api` — geração.** `gerar_conteudo`, reusando ai-chat e cobrando por `spend_credits`.
- [ ] **6. Servidor MCP stdio.** Pacote `npx`, as seis tools, README com o bloco de config.
- [ ] **7. Fluxo de aprovação.** "Aprovar a semana" na UI do calendário — o pedido explícito do Maikon.
- [ ] **8. Teste de ponta a ponta com o Maikon**, numa marca real, agendando uma semana.

---

## 7. Critério de pronto

- O Maikon cola um bloco de config no Claude Desktop e no Codex e as seis tools aparecem.
- Ele manda "agenda essas 16 artes na Jornada, segunda/quarta/sexta até janeiro" e elas aparecem no
  calendário da Trend, na marca certa, no fuso certo.
- Token revogado na UI para de funcionar na chamada seguinte.
- `npm test` verde e escopo negado retorna 403, comprovado por teste.
