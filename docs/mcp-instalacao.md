# Conectar o TrendPulse no Claude e no Codex

O TrendPulse expõe um servidor MCP. Conectando, o Claude e o Codex passam a gerar conteúdo com a
identidade da sua marca, consultar o calendário e agendar posts sem você sair da conversa.

**Endpoint:** `https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp`

---

## 1. Pegue seu token

> ⚠️ **A tela de tokens ainda não existe** (é a Fase 2 da arquitetura). Por enquanto o Raul gera e
> te envia. Quando a tela entrar, será em **Perfil → Acesso de agentes**.

O token começa com `tp_pat_` e aparece **uma única vez**. Guarde num gerenciador de senhas — o
TrendPulse só armazena o hash e não consegue mostrar de novo.

Ele carrega **escopos**, que limitam o que o agente pode fazer:

| Escopo | Libera |
|---|---|
| `read` | saldo, calendário, redes conectadas |
| `generate` | criar post, carrossel, story, tweet card |
| `schedule` | agendar conteúdo e montar calendário |
| `publish` | publicar na hora — **fora do padrão**, peça só se quiser |

Ferramenta fora do escopo **nem aparece** para o agente.

---

## 2. Jeito fácil: o instalador

Peça o arquivo ao Raul e **dê um clique duplo**. Ele conecta o TrendPulse ao Claude Desktop, ao
Claude Code e ao Codex — o que estiver na máquina — e testa o token antes de escrever qualquer
coisa.

| Sistema | Arquivo | Como abrir |
|---|---|---|
| Mac | `instalar-trendpulse-mcp.command` | clique duplo |
| Windows | `instalar-trendpulse-mcp.ps1` | clique direito → *Executar com o PowerShell* |

Ele cola o token pra você, faz backup das configs e **preserva os outros servidores MCP** que você
já usa. Rodar de novo troca o token sem duplicar nada.

> No Mac, na primeira vez o sistema pode dizer que o arquivo é de "desenvolvedor não identificado".
> Clique direito → **Abrir** → **Abrir** de novo, e ele roda.

Se preferir fazer na mão, os blocos estão abaixo.

## 3. Claude Code (manual)

```bash
claude mcp add --transport http trendpulse https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp --header "Authorization: Bearer tp_pat_SEU_TOKEN_AQUI"
```

Confira com `/mcp` dentro do Claude: `trendpulse` deve aparecer como conectado.

## 4. Claude Desktop (manual)

Em **Settings → Developer → Edit Config**, dentro de `mcpServers`:

```json
{
  "mcpServers": {
    "trendpulse": {
      "type": "http",
      "url": "https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp",
      "headers": { "Authorization": "Bearer tp_pat_SEU_TOKEN_AQUI" }
    }
  }
}
```

Reinicie o app depois de salvar.

## 5. Codex CLI (manual)

Em `~/.codex/config.toml`:

```toml
[mcp_servers.trendpulse]
url = "https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp"
bearer_token_env_var = "TRENDPULSE_TOKEN"
```

E exporte o token no ambiente (evita deixá-lo no arquivo de config):

```bash
export TRENDPULSE_TOKEN=tp_pat_SEU_TOKEN_AQUI
```

---

## 6. Conferindo que funcionou

Peça ao agente, em linguagem normal:

> "quantos créditos eu tenho no TrendPulse?"

Se ele responder com o saldo, está conectado.

---

## O que dá pra pedir

O agente escolhe a ferramenta sozinho; você fala normal:

- *"quais redes eu tenho conectadas no TrendPulse?"*
- *"cria um post sobre prevenção de infarto em adultos jovens"*
- *"faz um carrossel de 5 slides sobre sinais de síndrome cardiometabólica"*
- *"o que já está agendado pra semana que vem?"*
- *"agenda esse conteúdo pra terça às 9h"*
- *"monta um calendário de 3 posts por semana até o fim do mês"*

**Geração cobra crédito** (10 por post, 10 por slide de carrossel, 6 por série de tweet card). Peça o
saldo antes de mandar gerar em lote.

---

## Limites de hoje, ditos com clareza

- **Não existe tela pra você gerar o próprio token** ainda — depende do Raul (Fase 2).
- **Não dá pra mandar uma imagem pronta** do Claude direto pro calendário. É a ferramenta
  `agendar_arte`, ainda não construída (Fase 4). Hoje o agente gera pela plataforma; ele ainda não
  recebe arte feita fora.
- **Não dá pra criar marca pelo MCP** — o wizard é visual e multi-etapa. Liste e use as existentes.
- **`publish` não vem por padrão.** O agente agenda; a publicação sai pelo agendador na hora marcada.

## Se der errado

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Token inválido, revogado ou expirado" | token errado, revogado, ou faltou o `Bearer ` | confira o header inteiro: `Authorization: Bearer tp_pat_...` |
| A ferramenta não aparece na lista | seu token não tem o escopo dela | peça um token com o escopo que falta |
| "Este token não tem o escopo X" | mesma coisa, na hora da chamada | idem |
| "Saldo insuficiente" | acabaram os créditos | recarregue em Perfil → Créditos |

## Revogar

Perdeu o controle do token (vazou, máquina compartilhada, saiu da equipe)? Peça a revogação: o
token para de funcionar na chamada seguinte, sem afetar os outros nem sua conta.
