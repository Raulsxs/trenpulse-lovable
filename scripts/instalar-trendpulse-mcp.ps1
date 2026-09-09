# Instalador do TrendPulse MCP para Windows.
#
# COMO USAR: clique direito no arquivo -> "Executar com o PowerShell".
# Ou, se o Windows bloquear:  powershell -ExecutionPolicy Bypass -File .\instalar-trendpulse-mcp.ps1
#
# Conecta o TrendPulse ao Claude Desktop, ao Claude Code e ao Codex — o que estiver na máquina.
# NUNCA sobrescreve sua config: faz backup e insere só o bloco do TrendPulse, preservando os
# outros servidores MCP que você já usa.

param([string]$Token = "")

$ErrorActionPreference = "Stop"
$URL = "https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp"

function Azul($t)     { Write-Host $t -ForegroundColor Cyan }
function Verde($t)    { Write-Host $t -ForegroundColor Green }
function Vermelho($t) { Write-Host $t -ForegroundColor Red }
function Cinza($t)    { Write-Host $t -ForegroundColor DarkGray }

Write-Host ""
Azul "=============================================="
Azul "  TrendPulse - conectar ao Claude e ao Codex"
Azul "=============================================="
Write-Host ""

# ── Token ──────────────────────────────────────────────────────────────────
if (-not $Token) {
  Write-Host "Cole o seu token do TrendPulse (comeca com tp_pat_) e aperte Enter:"
  $Token = Read-Host "> "
}
$Token = $Token.Trim()

if (-not $Token.StartsWith("tp_pat_")) {
  Vermelho "Esse token nao parece certo - ele comeca com tp_pat_."
  Read-Host "Enter para fechar" | Out-Null
  exit 1
}

# ── Confere ANTES de escrever config ───────────────────────────────────────
# Gravar config com token invalido deixa o cliente quebrado em silencio: a ferramenta some da
# lista e ninguem sabe por que.
Azul "Testando o token..."
try {
  $body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  $resp = Invoke-RestMethod -Uri $URL -Method Post -TimeoutSec 30 `
    -Headers @{ Authorization = "Bearer $Token" } -ContentType "application/json" -Body $body
  if (-not $resp.result.tools) { throw "sem tools na resposta" }
  Verde "  Token valido ($($resp.result.tools.Count) ferramentas)."
} catch {
  Vermelho "  O servidor recusou esse token."
  Cinza "  $($_.Exception.Message)"
  Read-Host "Enter para fechar" | Out-Null
  exit 1
}
Write-Host ""

$instalados = 0

# ── Claude Desktop ─────────────────────────────────────────────────────────
$dirClaude = Join-Path $env:APPDATA "Claude"
$cfgClaude = Join-Path $dirClaude "claude_desktop_config.json"
if (Test-Path $dirClaude) {
  Azul "Claude Desktop..."
  if (Test-Path $cfgClaude) {
    Copy-Item $cfgClaude "$cfgClaude.backup-$(Get-Date -Format yyyyMMddHHmmss)"
    # -AsHashtable nao existe no PowerShell 5.1, entao convertemos manualmente pra poder inserir.
    $json = Get-Content $cfgClaude -Raw -Encoding UTF8 | ConvertFrom-Json
  } else {
    New-Item -ItemType Directory -Force -Path $dirClaude | Out-Null
    $json = [PSCustomObject]@{}
  }

  if (-not $json.PSObject.Properties.Name -contains "mcpServers" -or $null -eq $json.mcpServers) {
    $json | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{}) -Force
  }

  $entrada = [PSCustomObject]@{
    type    = "http"
    url     = $URL
    headers = [PSCustomObject]@{ Authorization = "Bearer $Token" }
  }
  $json.mcpServers | Add-Member -NotePropertyName trendpulse -NotePropertyValue $entrada -Force

  # UTF8 sem BOM: o Claude Desktop nao le config com BOM.
  $texto = $json | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($cfgClaude, $texto, (New-Object System.Text.UTF8Encoding($false)))

  Verde "  Pronto. Feche e abra o Claude Desktop."
  $instalados++
  Write-Host ""
} else {
  Cinza "Claude Desktop nao encontrado - pulando."
  Write-Host ""
}

# ── Claude Code (CLI) ──────────────────────────────────────────────────────
if (Get-Command claude -ErrorAction SilentlyContinue) {
  Azul "Claude Code..."
  # Remove antes de adicionar: rodar duas vezes nao pode duplicar o servidor.
  claude mcp remove trendpulse 2>$null | Out-Null
  claude mcp add --transport http trendpulse $URL --header "Authorization: Bearer $Token" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Verde "  Pronto. Confira com /mcp dentro do Claude."
    $instalados++
  } else {
    Vermelho "  Falhou. Rode manualmente:"
    Cinza "    claude mcp add --transport http trendpulse $URL --header `"Authorization: Bearer $Token`""
  }
  Write-Host ""
} else {
  Cinza "Claude Code (CLI) nao encontrado - pulando."
  Write-Host ""
}

# ── Codex CLI ──────────────────────────────────────────────────────────────
$dirCodex = Join-Path $env:USERPROFILE ".codex"
$cfgCodex = Join-Path $dirCodex "config.toml"
if ((Test-Path $dirCodex) -or (Get-Command codex -ErrorAction SilentlyContinue)) {
  Azul "Codex..."
  New-Item -ItemType Directory -Force -Path $dirCodex | Out-Null
  if (-not (Test-Path $cfgCodex)) { New-Item -ItemType File -Path $cfgCodex | Out-Null }
  Copy-Item $cfgCodex "$cfgCodex.backup-$(Get-Date -Format yyyyMMddHHmmss)"

  $linhas = @(Get-Content $cfgCodex -Encoding UTF8)
  $bloco = @("[mcp_servers.trendpulse]", "url = `"$URL`"", "bearer_token_env_var = `"TRENDPULSE_TOKEN`"", "")

  if ($linhas -match "^\[mcp_servers\.trendpulse\]") {
    Cinza "  Ja estava configurado - atualizando."
    # Reescreve so o bloco do trendpulse, do cabecalho ate a proxima secao.
    $saida = New-Object System.Collections.Generic.List[string]
    $pulando = $false
    foreach ($l in $linhas) {
      if ($l -match "^\[mcp_servers\.trendpulse\]") { $pulando = $true; $bloco | ForEach-Object { $saida.Add($_) }; continue }
      if ($pulando -and $l -match "^\[") { $pulando = $false }
      if (-not $pulando) { $saida.Add($l) }
    }
    $linhas = $saida.ToArray()
  } else {
    $linhas = $linhas + "" + $bloco
  }
  [System.IO.File]::WriteAllLines($cfgCodex, $linhas, (New-Object System.Text.UTF8Encoding($false)))

  # O token vai pra variavel de ambiente do usuario, NAO pro config.toml: assim ele nao vaza se
  # voce compartilhar o arquivo de config.
  [System.Environment]::SetEnvironmentVariable("TRENDPULSE_TOKEN", $Token, "User")

  Verde "  Pronto. Abra um terminal NOVO pro token entrar no ambiente."
  $instalados++
  Write-Host ""
} else {
  Cinza "Codex nao encontrado - pulando."
  Write-Host ""
}

# ── Fecho ──────────────────────────────────────────────────────────────────
if ($instalados -eq 0) {
  Vermelho "Nao achei Claude Desktop, Claude Code nem Codex nesta maquina."
} else {
  Azul "=============================================="
  Verde "  Conectado em $instalados lugar(es)."
  Azul "=============================================="
  Write-Host ""
  Write-Host "Pra testar, pergunte ao seu assistente:"
  Cinza "    `"quantos creditos eu tenho no TrendPulse?`""
  Write-Host ""
  Write-Host "Se ele responder com o saldo, esta funcionando."
}

Write-Host ""
Read-Host "Enter para fechar" | Out-Null
