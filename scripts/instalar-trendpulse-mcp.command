#!/bin/bash
# Instalador do TrendPulse MCP para macOS.
#
# COMO USAR: clique duplo neste arquivo. Ele conecta o TrendPulse ao Claude Desktop,
# ao Claude Code e ao Codex — o que estiver instalado na máquina.
#
# POR QUE UM SCRIPT E NÃO UM PACOTE .mcpb: o formato .mcpb do Claude Desktop é feito pra servidor
# LOCAL. Pra apontar num servidor remoto ele exige empacotar um "bridge" em Node que fica no meio do
# caminho — mais uma peça pra quebrar, e que não resolve o Codex de jeito nenhum. Um script que
# escreve as duas configs cobre os dois clientes sem instalar nada.
#
# ELE NUNCA SOBRESCREVE SUA CONFIG. Faz backup e insere só o bloco do TrendPulse, preservando os
# outros servidores MCP que você já usa.

set -u
URL="https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp"

# Ir pra pasta do script (clique duplo abre o Terminal no home).
cd "$(dirname "$0")" || true

azul()  { printf "\033[1;34m%s\033[0m\n" "$1"; }
verde() { printf "\033[1;32m%s\033[0m\n" "$1"; }
vermelho() { printf "\033[1;31m%s\033[0m\n" "$1"; }
cinza() { printf "\033[0;90m%s\033[0m\n" "$1"; }

echo
azul "══════════════════════════════════════════════"
azul "  TrendPulse — conectar ao Claude e ao Codex"
azul "══════════════════════════════════════════════"
echo

# ── Token ──────────────────────────────────────────────────────────────────
TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  echo "Cole o seu token do TrendPulse (começa com tp_pat_) e aperte Enter:"
  printf "> "
  read -r TOKEN
fi
TOKEN="$(echo "$TOKEN" | tr -d '[:space:]')"

case "$TOKEN" in
  tp_pat_*) ;;
  *) vermelho "Esse token não parece certo — ele começa com tp_pat_."
     echo "Peça um novo token e rode de novo."
     echo; read -r -p "Enter para fechar." _; exit 1 ;;
esac

# ── Confere ANTES de escrever config ───────────────────────────────────────
# Gravar config com token inválido deixa o cliente quebrado em silêncio: a ferramenta some da lista
# e ninguém sabe por quê. Melhor descobrir agora.
azul "Testando o token…"
RESP="$(curl -s -m 30 -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)"

case "$RESP" in
  *'"tools"'*) verde "  Token válido." ;;
  *) vermelho "  O servidor recusou esse token."
     cinza "  Resposta: $(echo "$RESP" | cut -c1-160)"
     echo; read -r -p "Enter para fechar." _; exit 1 ;;
esac
echo

INSTALADOS=0

# ── Claude Desktop ─────────────────────────────────────────────────────────
CFG_CLAUDE="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -d "$HOME/Library/Application Support/Claude" ]; then
  azul "Claude Desktop…"
  mkdir -p "$(dirname "$CFG_CLAUDE")"
  [ -f "$CFG_CLAUDE" ] && cp "$CFG_CLAUDE" "$CFG_CLAUDE.backup-$(date +%Y%m%d%H%M%S)"

  if command -v python3 >/dev/null 2>&1; then
    # python3 mexe no JSON preservando o que já existe. Escrever "na mão" com sed apagaria os
    # outros servidores MCP na primeira config que fugisse do formato esperado.
    TP_URL="$URL" TP_TOKEN="$TOKEN" TP_CFG="$CFG_CLAUDE" python3 <<'PY'
import json, os
caminho = os.environ["TP_CFG"]
try:
    with open(caminho, encoding="utf-8") as f:
        cfg = json.load(f)
except Exception:
    cfg = {}
if not isinstance(cfg, dict):
    cfg = {}
cfg.setdefault("mcpServers", {})
cfg["mcpServers"]["trendpulse"] = {
    "type": "http",
    "url": os.environ["TP_URL"],
    "headers": {"Authorization": "Bearer " + os.environ["TP_TOKEN"]},
}
with open(caminho, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
    if [ $? -eq 0 ]; then
      verde "  Pronto. Feche e abra o Claude Desktop."
      INSTALADOS=$((INSTALADOS+1))
    else
      vermelho "  Falhou ao escrever a config."
    fi
  else
    vermelho "  python3 não encontrado — não dá pra editar a config com segurança."
    echo "  Abra o Claude Desktop em Settings → Developer → Edit Config e cole dentro de mcpServers:"
    cinza "    \"trendpulse\": { \"type\": \"http\", \"url\": \"$URL\", \"headers\": { \"Authorization\": \"Bearer $TOKEN\" } }"
  fi
  echo
else
  cinza "Claude Desktop não encontrado — pulando."
  echo
fi

# ── Claude Code (CLI) ──────────────────────────────────────────────────────
if command -v claude >/dev/null 2>&1; then
  azul "Claude Code…"
  # Remove antes de adicionar: rodar o instalador duas vezes não pode duplicar o servidor.
  claude mcp remove trendpulse >/dev/null 2>&1
  if claude mcp add --transport http trendpulse "$URL" --header "Authorization: Bearer $TOKEN" >/dev/null 2>&1; then
    verde "  Pronto. Confira com /mcp dentro do Claude."
    INSTALADOS=$((INSTALADOS+1))
  else
    vermelho "  Falhou. Rode manualmente:"
    cinza "    claude mcp add --transport http trendpulse $URL --header \"Authorization: Bearer $TOKEN\""
  fi
  echo
else
  cinza "Claude Code (CLI) não encontrado — pulando."
  echo
fi

# ── Codex CLI ──────────────────────────────────────────────────────────────
CFG_CODEX="$HOME/.codex/config.toml"
if [ -d "$HOME/.codex" ] || command -v codex >/dev/null 2>&1; then
  azul "Codex…"
  mkdir -p "$HOME/.codex"
  touch "$CFG_CODEX"
  cp "$CFG_CODEX" "$CFG_CODEX.backup-$(date +%Y%m%d%H%M%S)"

  if grep -q "^\[mcp_servers.trendpulse\]" "$CFG_CODEX" 2>/dev/null; then
    cinza "  Já estava configurado — atualizando o token."
    # Reescreve só o bloco do trendpulse, do cabeçalho até a próxima seção.
    awk -v url="$URL" '
      /^\[mcp_servers\.trendpulse\]/ { pulando=1; print "[mcp_servers.trendpulse]"; print "url = \"" url "\""; print "bearer_token_env_var = \"TRENDPULSE_TOKEN\""; print ""; next }
      pulando && /^\[/ { pulando=0 }
      !pulando { print }
    ' "$CFG_CODEX" > "$CFG_CODEX.tmp" && mv "$CFG_CODEX.tmp" "$CFG_CODEX"
  else
    {
      echo ""
      echo "[mcp_servers.trendpulse]"
      echo "url = \"$URL\""
      echo "bearer_token_env_var = \"TRENDPULSE_TOKEN\""
    } >> "$CFG_CODEX"
  fi

  # O token vai pro shell, NÃO pro config.toml: assim ele não vaza se você compartilhar o arquivo
  # de config ou colocar num repositório.
  for RC in "$HOME/.zshrc" "$HOME/.bash_profile"; do
    [ -f "$RC" ] || continue
    if grep -q "TRENDPULSE_TOKEN" "$RC"; then
      # Substitui a linha antiga, pra troca de token não deixar duas.
      grep -v "TRENDPULSE_TOKEN" "$RC" > "$RC.tmp" && mv "$RC.tmp" "$RC"
    fi
    echo "export TRENDPULSE_TOKEN=$TOKEN" >> "$RC"
  done

  verde "  Pronto. Abra um Terminal NOVO pro token entrar no ambiente."
  INSTALADOS=$((INSTALADOS+1))
  echo
else
  cinza "Codex não encontrado — pulando."
  echo
fi

# ── Fecho ──────────────────────────────────────────────────────────────────
if [ "$INSTALADOS" -eq 0 ]; then
  vermelho "Não achei Claude Desktop, Claude Code nem Codex nesta máquina."
  echo "Instale um deles e rode de novo."
else
  azul "══════════════════════════════════════════════"
  verde "  Conectado em $INSTALADOS lugar(es)."
  azul "══════════════════════════════════════════════"
  echo
  echo "Pra testar, pergunte ao seu assistente:"
  cinza "    \"quantos créditos eu tenho no TrendPulse?\""
  echo
  echo "Se ele responder com o saldo, está funcionando."
fi

echo
read -r -p "Enter para fechar." _
