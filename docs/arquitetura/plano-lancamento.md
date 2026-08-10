# Plano de melhorias — pré-divulgação

Consolidação das quatro frentes: **segurança**, **estabilidade**, **UX** e **inteligência do motor**.
Tudo verificado em produção ou medido nos dados reais de uso. Onde não deu para confirmar, está dito.

O produto sai de poucos usuários conhecidos (que avisam no WhatsApp quando quebra) para gente que
simplesmente vai embora. Falha silenciosa passa a custar cliente.

---

## O achado que muda o desenho do produto

Analisando **147 turnos de conversa** (21/07 a 10/08), o uso real é muito mais estreito do que o
produto assume:

| Ferramenta | Usos | Fatia |
|---|---|---|
| **`link_para_post`** | **78** | **74%** |
| `gerar_post` | 17 | 16% |
| `gerar_carrossel` | 16 | 15% |
| `gerar_story` | 8 | 8% |
| resto (tweet, editorial, editar) | 6 | 6% |

E mais revelador: dos **39 usos dos atalhos de formato**, quase todos foram preenchidos com um
**link**, não com um tema. A pessoa clica em "Carrossel", o campo preenche
`"Crie um carrossel de 5 slides... sobre: "`, e ela cola uma URL ali.

> **O produto foi desenhado para "descreva um tema". O uso real é "cole um link".**

Isso não é um bug, é um desalinhamento de superfície: o caminho mais usado é o menos servido pela
interface. Reordenar em torno dele é a melhoria de UX com maior alcance.

---

## Frente 1 — Segurança

| # | Item | Severidade | Estado |
|---|---|---|---|
| S1 | `CREDITS_ENFORCED` desligado: gerava sem saldo | CRÍTICO | ✅ **corrigido** |
| S2 | `generate-image` gera sem debitar crédito, chamada viva do front | ALTO | ⛔ aberto |
| S3 | `getClaims()` em 4 funções, contra a regra do projeto | MÉDIO | ⛔ aberto |
| S4 | `content_metrics` com policy `ALL/true/PUBLIC` (tabela vazia hoje) | BAIXO | ⛔ aberto |

**S1 (feito):** verificado que o secret não existia e o default era `false`. Ligado e testado com
usuário zerado: bloqueia com mensagem clara, sem gastar provedor.

**S2:** `generate-image` não tem nenhum `spend_credits` e é chamada de `ContentPreview`. Exige JWT,
então precisa de conta — mas qualquer conta pode chamar em loop pelo DevTools e queimar a chave do
provedor. **Precisa da sua decisão:** cobrar crédito ou aposentar a função (verificar se ainda é
usada de verdade).

**Falsos positivos que a auditoria levantou e eu verifiquei serem seguros** (registrados para não
gastarmos esforço): `get_cron_users_due` já está restrita a `service_role`; a policy de
`user_subscriptions` também; as policies de INSERT têm `WITH CHECK (auth.uid() = user_id)` corretas;
nenhuma tabela do `public` sem RLS; nenhum segredo no bundle do front.

## Frente 2 — Estabilidade

| # | Item | Severidade | Estado |
|---|---|---|---|
| E1 | Cron do worker **não existia**: job órfão nunca se recuperava | CRÍTICO | ✅ **corrigido** |
| E2 | 6 conteúdos presos em `processing` (o mais antigo: 1 mês e 18 dias) | CRÍTICO | ✅ **corrigido** |
| E3 | Publicação presa em `publishing` sem ninguém reverter | CRÍTICO | ✅ **corrigido** |
| E4 | Telemetria zero: nada é diagnosticável depois do fato | ALTO | ⛔ aberto |
| E5 | Sem limite de concorrência: 10 usuários = ~50 imagens simultâneas | MÉDIO | ⛔ aberto |
| E6 | Cobrança em duplicidade sem idempotência por job | MÉDIO | ⛔ aberto |

**E1-E3 (feitos):** três crons criados (worker 3min, reconciliação de conteúdo 10min, de publicação
15min), autenticados por token dedicado no Vault. As 6 peças presas eram de um cliente pagante e
tinham todas as imagens: o trabalho saiu e foi cobrado, só o estado não fechou.

**E4 é o mais importante do que resta.** Sem telemetria, todos os outros itens continuam sendo
descobertos por reclamação. Tentei diagnosticar uma geração de 85s e os logs do Supabase já não
existiam mais. O que gravar por geração: modelo, duração, custo (`usage.cost` já vem do OpenRouter),
status e erro. É a mesma tabela que responde "batemos em rate limit?" e "qual a margem real?".

**E6 tem nuance:** 33 conteúdos têm mais de um débito, mas a maioria é **uso legítimo** (um caso teve
9 cobranças espaçadas em 17 minutos — a pessoa refez 9 vezes). Filtrando por débitos em menos de 60
segundos, sobram **2 casos históricos**. Risco real, frequência baixa.

## Frente 3 — UX

| # | Item | Base | Estado |
|---|---|---|---|
| U1 | Checklist de primeiros passos no chat | — | ✅ **feito** |
| U2 | Spotlight só após 2 gerações (não empurra avançado antes do básico) | — | ✅ **feito** |
| U3 | Jargão fora ("prompt") + tooltips nos formatos | — | ✅ **feito** |
| U4 | Central de Ajuda reescrita + réplica fiel da UI | — | ✅ **feito** |
| U5 | **Superfície para link, o caminho de 74% do uso** | 78 de 105 ações | ⛔ aberto |
| U6 | O template do atalho engessa o pedido | 39 usos, quase todos com link | ⛔ aberto |
| U7 | Percepção de espera: 50-103s bloqueando o usuário | medido | ⛔ aberto |

**U5 é a maior oportunidade.** Não existe atalho para colar link, que é o que as pessoas mais fazem.
Elas contornam usando o atalho de formato e colando a URL no lugar do tema. Proposta: um atalho
dedicado, ou o campo detectar link colado e perguntar só o formato.

**U7:** a fila assíncrona **já existe** e resolve isso — o tempo total não muda, mas a pessoa deixa
de ficar presa. Hoje ela não é o caminho padrão. É decisão de produto, não correção.

## Frente 4 — Inteligência do motor

Medida por **comportamento**, não por pesquisa de satisfação: nota tem viés (só responde quem está
muito satisfeito ou muito irritado) e atrito. O comportamento não mente.

**Linha de base (467 gerações, 90 dias):**

| Métrica | Valor |
|---|---|
| Publicadas | **25,9%** |
| Retrabalho (nova geração em <10 min) | **42,8%** |

**Por formato:**

| Formato | Publicadas | Retrabalho |
|---|---|---|
| story | 43-45% | 29-36% |
| carousel | 14-25% | 33-37% |
| **post** | **0%** | 45-50% |

**Já construído** (migration `20260810120000`):
- `agent_quality_metrics` — o painel semanal por formato.
- `agent_failure_cases` — peças rejeitadas **com o que o usuário pediu logo depois** (a correção
  implícita). É o insumo da autoanálise.
- `agent_message_log.content_id` — liga conversa a peça.

**O que falta:**

| # | Item | Por quê |
|---|---|---|
| I1 | Investigar o `post` com 0% de publicação | É a anomalia mais forte da base |
| I2 | Ciclo de autoanálise periódico | Hoje a análise sou eu, manualmente |
| I3 | Agir quando o usuário reclama | Achado abaixo |
| I4 | Versionar prompt + comparar contra a linha de base | Sem isso, "melhorou" é palpite |

**I3 — o episódio mais caro que achei nas conversas:** em 10/08 o usuário escreveu *"saiu tudo
errado. quero que crie algo"* e o agente **apenas conversou**, sem gerar nada. Quando a pessoa está
frustrada, conversa é a pior resposta possível. Foram 2 casos em 147 turnos (o outro: um link colado
que o agente descreveu mas não executou) — pouco frequente, mas altíssimo custo emocional.

**Nota honesta sobre o volume:** 147 turnos concentrados em 2 usuários. Serve para achar padrões
qualitativos, não para estatística. As conclusões acima devem ser reconfirmadas quando houver
tráfego real.

---

## Ordem recomendada

**Antes de divulgar** (o que dói se acontecer com desconhecido):

1. **E4 — telemetria.** É o que faz todo o resto ser diagnosticável. Sem isso você está cego.
2. **S2 — `generate-image` sem cobrança.** Buraco no bolso com porta aberta.
3. **U5 — superfície para link.** Maior alcance de UX, mexe no caminho de 74% do uso.

**Logo depois:**

4. **U7 — fila como padrão** para carrossel (o formato mais lento).
5. **I1 — investigar o `post`** com 0% de publicação.
6. **E5 — lotes na geração de slides**, para achatar o pico de concorrência.

**Quando houver dado de tráfego real:**

7. **I2/I4 — ciclo de autoanálise** e versionamento de prompt.
8. **E6 — idempotência de cobrança** (raro hoje, mas escala com o volume).

---

## Decisões que dependem de você

- **`generate-image`:** cobrar crédito ou aposentar? Preciso saber se ainda é usada.
- **`post` com 0% de publicação:** investigar antes ou depois de divulgar?
- **fal.ai:** mantido como plano B, com gatilho objetivo (429 recorrentes na telemetria). Hoje o pico
  real é de 4 gerações/hora e o OpenRouter não impõe limite em modelos pagos.
