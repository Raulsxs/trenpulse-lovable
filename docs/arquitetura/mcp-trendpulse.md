# Arquitetura — MCP do TrendPulse

**Capacidade:** deixar o Claude e o Codex operarem o TrendPulse de dentro da sessão do usuário —
mandar a arte que o agente acabou de criar pro calendário, agendar, listar marcas e contas, checar
saldo — sem que a pessoa saia pra outra aba.

**Estado:** self-serve FECHADO (2026-09-12). Fases 1, 2, 4 e 6 entregues + instalador — um cliente
já gera o próprio token e conecta sem ninguém no meio. Instalação em `docs/mcp-instalacao.md`.
Falta o fluxo de aprovação (7) e o OAuth de um clique.
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

### 3.3 Transporte: REMOTO (streamable HTTP), não stdio

**Esta decisão foi revista.** A primeira versão deste doc escolheu stdio via `npx`, com o Maikon em
mente. Quando o objetivo passou a ser *qualquer cliente conectar*, stdio deixou de servir: exige
Node na máquina e edição de arquivo de config. Nenhum médico faz isso, e um produto self-serve não
pode depender de o Raul colar JSON pra cada cliente.

Verificado na doc oficial: o **Codex CLI suporta streamable HTTP** com `[mcp_servers.<nome>]` +
`url`, e autentica por OAuth (`codex mcp login`) **ou** bearer token estático. O Claude aceita
conector remoto do mesmo jeito. Ou seja, o remoto atende os dois clientes que importam.

- **v1: bearer token (o PAT da §3.2).** O cliente gera o token no Perfil e cola uma vez. Duas linhas
  de config, sem instalar nada.
- **v2: OAuth.** Aí vira o "Conectar" de um clique, que é o que fecha o self-serve de verdade.

O servidor MCP é uma **edge function Deno**, como todo o resto do backend: sem infra nova, sem
pipeline de deploy novo, com os mesmos secrets e o mesmo banco. Um serviço Node separado seria mais
uma coisa pra manter no ar sem ganho nenhum.

### 3.4 O MCP NÃO é uma API paralela — ele expõe as tools que já existem

O erro fácil aqui seria escrever um `mcp-api` que reimplementa agendar, gerar e listar. Isso cria um
segundo caminho de código que diverge do app na primeira mudança, e dobra a superfície de bug em
cima de cobrança e publicação.

`supabase/functions/_shared/agent-tools.ts` **já tem 24 tools** com descrições escritas pra LLM
("Chame quando o usuário pede…"), já usadas pelo agente interno. É o catálogo de capacidades do
produto. O MCP expõe o MESMO catálogo:

```
_shared/agent-tools.ts  ← fonte única: schema + executor
        ├── ai-agent    (chat do app)
        └── mcp         (Claude / Codex)
```

Tool nova nasce nos dois lugares de uma vez. Correção de bug vale pros dois. É isso que responde
"melhorar a arquitetura da Trend": não é acrescentar camada, é parar de ter duas.

**A ponte PAT → RLS (verificada, não suposta).** O `ToolCtx` exige `userAuthHeader` com JWT de
usuário, porque as tools dependem de RLS pra isolamento. Um PAT não é JWT. Testado em produção o
caminho oficial:

1. `POST /auth/v1/admin/generate_link` (service_role) → `hashed_token`
2. `POST /auth/v1/verify` (anon) → `access_token` real do usuário
3. Cliente com esse JWT → **RLS ativa**

Confirmado com a conta do Maikon: 5 marcas visíveis, todas dela, nenhuma de outro usuário. O JWT
vale 3600s e é cacheável por token, então o custo é uma troca por hora, não por chamada.

A alternativa — service_role + filtrar `user_id` na mão em cada tool — foi **descartada**: troca
isolamento garantido pelo banco por disciplina de código, em 24 tools que mexem em crédito e
publicação. Um esquecimento ali vaza conteúdo entre clientes.

### 3.5 Cobrança

`agendar_arte` com imagem pronta **não cobra crédito** — não gerou nada, só guardou e agendou.
`gerar_conteudo` cobra o mesmo que o app cobra, pelo mesmo `spend_credits`. Qualquer caminho
alternativo de cobrança aqui viraria buraco de margem.

---

## 4. Fora de escopo (v1)

- **Publicação imediata** (`publicar_agora`) — o usuário pediu aprovação antes; entra só se ele pedir.
- **OAuth** — a v1 conecta por bearer token (PAT). OAuth é o que transforma "cole este token" em
  "clique em Conectar", e entra na v2. Sem ele o self-serve ainda tem um passo manual.

  Verificado em 2026-09-12: o fluxo nativo de *Adicionar conector* do Claude **exige registro
  dinâmico de cliente OAuth contra a origem do servidor**, sem alternativa por header estático — ou
  seja, colar token nunca vira "um link" por mais que se melhore a tela. As três peças que faltam
  são 401 com `WWW-Authenticate`, Protected Resource Metadata (RFC 9728) e Dynamic Client
  Registration (RFC 7591). O Supabase Auth já é o authorization server.
- **stdio / pacote npm** — descartado como transporte principal (§3.3). Só volta se aparecer cliente
  que precise rodar offline.
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
4. ~~Maikon tem 0 contas sociais conectadas~~ — **ERRADO, corrigido em 2026-09-08.** Eu tinha
   consultado a tabela `social_connections`, mas quem manda é a API do Post for Me (o CLAUDE.md diz
   isso explicitamente e eu passei por cima). Pelo MCP: **9 contas conectadas** — LinkedIn (Douglas,
   Maikon, DrEscala, AGES), Instagram (agessaude, hearttsurgery, maikonmadeira) e X. Não há risco de
   agendar no vazio.
5. **Fuso horário.** Ele opera em SC, Goiânia, BH e Rio. Agendar em UTC sem dizer isso gera post às
   3h da manhã. Mitigação: a API aceita e devolve horário com fuso explícito.
6. **npm scope `@trendpulse`** pode não estar registrado. Verificar antes da Fase 3.

---

## 6. Plano de execução

- [x] **1. PAT — schema e verificação.** Tabela `api_tokens`, geração com `gen_random_bytes`, helper
      `requirePat()` com escopos, RLS fechada.
- [x] **2. PAT — UI.** `Perfil → Agentes` (`/profile?tab=agentes`): criar com o token aparecendo uma
      única vez junto do comando de instalação já preenchido, listar com escopos e último uso,
      revogar com confirmação. VERIFICADO de ponta a ponta: token criado na tela respondeu
      `consultar_saldo` com o saldo real, e depois de revogado a chamada seguinte foi recusada.
- [x] **3. Ponte PAT → sessão.** `jwtDoUsuario()` na edge function `mcp`: generate_link + verify,
      cacheado por 55 min. Comprovado pela RLS: um token novo leu o saldo do dono e nada de outro
      usuário.
- [x] **4. `agendar_arte`.** Recebe imagem pronta (URL ou base64), sobe pro bucket e cria
      `generated_contents` agendado. Não cobra crédito: nada foi gerado. Travas: data no passado,
      colisão de horário exato, teto de 8 MB, marca inexistente (lista as que existem).
- [x] **5. Curadoria do catálogo.** 13 das 25 tools expostas, filtradas por escopo do token —
      `tools/list` confirmado em produção. `publicar_agora` fica fora por decisão de produto: o
      usuário pediu para aprovar antes.
- [x] **6. Servidor MCP remoto.** Edge function `mcp` falando streamable HTTP, expondo o catálogo de
      `agent-tools.ts`, autenticada por PAT. Config de duas linhas para Claude e Codex.
- [ ] **7. Fluxo de aprovação.** "Aprovar a semana" na UI do calendário — o pedido explícito do Maikon.
- [ ] **8. Teste de ponta a ponta com o Maikon**, numa marca real, agendando uma semana.

---

## 7. Critério de pronto

- O cliente entra em Perfil → Agentes, cria o próprio token e cola o comando que a tela já monta —
  sem ninguém no meio. FEITO e verificado.
- Ele manda "agenda essas 16 artes na Jornada, segunda/quarta/sexta até janeiro" e elas aparecem no
  calendário da Trend, na marca certa, no fuso certo.
- Token revogado na UI para de funcionar na chamada seguinte.
- `npm test` verde e escopo negado retorna 403, comprovado por teste.
