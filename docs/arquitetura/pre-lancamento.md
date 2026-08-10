# Pré-lançamento — segurança, estabilidade e inteligência

Mapa das melhorias antes de divulgar o TrendPulse para público desconhecido. Tudo aqui foi
**verificado em produção**, não inferido: onde não deu para confirmar, está dito.

O produto sai de poucos usuários conhecidos (que avisam no WhatsApp quando algo quebra) para gente
que simplesmente vai embora. Isso muda a régua: falha silenciosa passa a custar cliente.

---

## Ordem de execução (por risco real, não por gravidade teórica)

| # | Item | Por que primeiro | Estado |
|---|---|---|---|
| 1 | Ligar `CREDITS_ENFORCED` | Hoje qualquer um gera sem saldo e a conta é nossa | ⛔ aberto |
| 2 | Cron do worker da fila | O cron **não existe**; job órfão nunca se recupera | ⛔ aberto |
| 3 | Destravar conteúdo preso | 6 peças presas, a mais antiga há 1 mês e meio | ⛔ aberto |
| 4 | Telemetria de geração | Sem isso, nenhum item abaixo é diagnosticável | ⛔ aberto |
| 5 | Idempotência de cobrança | Real, mas raro (2 casos históricos) | ⛔ aberto |
| 6 | Limite de concorrência | Preventivo: 10 usuários = 50 imagens simultâneas | ⛔ aberto |
| 7 | Inteligência do agente | Fundação pronta; falta o ciclo de autoanálise | 🟡 parcial |

---

## 1. Créditos sem enforcement (o buraco no bolso)

**Verificado:** `CREDITS_ENFORCED` não está entre os secrets do projeto, e o default no código é
`false` (`ai-chat/index.ts:411`). O pre-check `insufficientCredits` **só loga e deixa passar**.

**Consequência:** alguém cria conta, gasta os 50 créditos de boas-vindas, e continua gerando de
graça. Cada peça custa dinheiro real de provedor. Com divulgação, isso escala rápido.

**Detalhe que engana:** as tools do agente (`agent-tools.ts`) **bloqueiam de verdade**. Então metade
do produto cobra e metade não, o que faz o problema passar despercebido em teste manual.

**Ação:** setar `CREDITS_ENFORCED=true` e verificar o comportamento com saldo zero (a mensagem de
saldo insuficiente precisa ser clara, não um erro genérico).

## 2. A fila não tem rede de segurança

**Verificado:** o único cron ativo é `publish-scheduled-content` (*/5). **Não existe cron para
`process-generation-jobs`.**

O worker só roda quando o front dá o "kick". Se o usuário fecha a aba, ou se o worker morre no meio,
o job fica em `processing` para sempre. O reaper existe, mas vive **dentro** de
`claim_next_job(p_user)` — e só é chamado para usuários que têm job `queued`. Quem tem só um job
morto nunca é revisitado.

**Ação:** cron de varredura (a cada 2-5 min) que pegue jobs órfãos de qualquer usuário.

## 3. Conteúdo preso em `processing`

**Verificado:** 6 conteúdos presos, o mais antigo há **1 mês e 18 dias**. Cada um é um usuário que viu
"gerando…" e nunca recebeu nada.

**Ação:** liberar os presos (marcar como falha) e criar reconciliação periódica.

## 4. Não sabemos o que acontece (observabilidade)

**Verificado:** nenhum Sentry, nenhuma telemetria, só `console.log` — e os logs do Supabase têm
retenção curta demais para diagnosticar depois do fato (tentei investigar uma geração de 85s e os
logs já não existiam).

Isso é o que transforma todos os outros itens em "o usuário reclamou" em vez de "o alerta disparou".

**Ação:** gravar por geração: modelo, duração, custo (`usage.cost` já vem do OpenRouter), status e
erro. É a mesma tabela que responde "estamos batendo em rate limit?" e "qual a margem real?".

## 5. Cobrança em duplicidade

**Verificado com nuance importante:** 33 conteúdos têm mais de um débito, mas a maioria é **uso
legítimo** (o usuário refez a peça; um caso teve 9 cobranças espaçadas em 17 minutos).

Filtrando por débitos em menos de 60 segundos, sobram **2 casos históricos**. O risco existe (não há
idempotência entre `generation_jobs.id` e `credit_ledger`), mas a frequência é baixa.

**Ação:** chave de idempotência por job no débito. Prioridade menor que 1-4 justamente porque é raro.

## 6. Concorrência

Um carrossel dispara 4-6 imagens em paralelo, e a fila roda uma invocação por usuário. **10 usuários
simultâneos = ~50 requisições simultâneas** ao provedor.

**Sobre trocar para o fal.ai:** não agora. O pico real medido hoje é de **4 gerações por hora**,
nunca vimos um 429, e a pesquisa confirmou que o OpenRouter **não impõe rate limit de plataforma em
modelos pagos**. Migrar trocaria um risco hipotético por uma mudança certa no visual das peças (o
fal.ai não tem gpt-image-2 nem Nano Banana Pro, e a identidade dos clientes atuais depende deles).

**Ação:** gerar slides em lotes (2-3 por vez) para achatar o pico, e manter o fal.ai como plano B com
gatilho claro: 429 recorrentes na telemetria do item 4.

## 7. Inteligência do agente

> Medir por **comportamento**, não por pesquisa de satisfação. Nota tem viés (só responde quem está
> muito satisfeito ou muito irritado) e atrito. O comportamento não mente.

**Já feito** (migration `20260810120000`):
- `agent_quality_metrics` — por semana e formato: gerado, publicado, refeito, abandonado.
- `agent_failure_cases` — as peças rejeitadas **com o que o usuário pediu logo depois** (a correção
  implícita).
- `agent_message_log.content_id` — liga conversa à peça.

**Linha de base (467 gerações, 90 dias):**

| Métrica | Valor |
|---|---|
| Publicadas | **25,9%** |
| Retrabalho (nova geração em <10min) | **42,8%** |

Por formato, a diferença é grande e acionável:

| Formato | Publicadas | Retrabalho |
|---|---|---|
| story | 43-45% | 29-36% |
| carousel | 14-25% | 33-37% |
| **post** | **0%** | 45-50% |

**O formato `post` não é publicado por ninguém há semanas.** É o achado mais forte da linha de base e
merece investigação própria: ou a peça sai ruim, ou o formato não serve para o que a pessoa queria.

**Falta construir — o ciclo de autoanálise:**
1. Job periódico lê `agent_failure_cases`, agrupa por padrão e destila o que deu errado (o mesmo que
   fizemos à mão ao achar os 3 gaps, agora contínuo).
2. O destilado vira regra no prompt do agente, versionada, com a métrica de antes e depois.
3. Fechar o ciclo: toda mudança de prompt é comparada contra a linha de base acima.

**Satisfação sem perguntar:** publicar = aprovou. Refazer = não serviu. Abandonar = desistiu. Só
introduzir pergunta explícita (👍/👎) se algum caso ficar ambíguo demais nesses sinais.

---

## O que NÃO precisa mexer (verificado como bem resolvido)

Para não gastarmos esforço refazendo o que está certo:

- **Cobrança nunca antecede a entrega**, e é proporcional ao entregue (carrossel cobra pelos slides
  que saíram, não pelos pedidos). A pergunta "paguei 5 e recebi 3?" tem resposta boa.
- `requireAuth` nas funções com `verify_jwt=false`; `p_user` sempre do JWT, nunca do body.
- Retry transitório com `Retry-After` no `orImage`; fallback sem referências.
- Lock otimista no scheduler (matou o bug dos posts duplicados) e reconciliação do PFM.
- Human-in-the-loop preservado: a fila gera sozinha, mas **nunca publica** sem o usuário.

---

## Aberto, precisa de decisão sua

- **Ligar `CREDITS_ENFORCED` agora?** Muda o comportamento para quem está sem saldo. Recomendo sim,
  antes de divulgar, mas é decisão de produto (quem estiver no meio de um teste será bloqueado).
- **O `post` com 0% de publicação** — investigar por quê antes ou depois de divulgar?
