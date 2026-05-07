# Apply Fase 0 migrations to Supabase via Management API.
# Splits each migration into atomic statements (preserving DO blocks).
# Idempotent - safe to re-run; statements use IF NOT EXISTS / EXCEPTION WHEN duplicate.

param(
  [string]$ProjectRef = "qdmhqxpazffmaxleyzxs",
  [string]$BwSession = $env:BW_SESSION,
  [string]$AccessTokenItemId = "2398537f-e6b7-47ff-9ca9-b44301753d07"
)

if (-not $BwSession) {
  Write-Error "BW_SESSION not set; cannot retrieve access token."
  exit 1
}

$env:BW_SESSION = $BwSession
$token = bw get password $AccessTokenItemId
if (-not $token) {
  Write-Error "Could not retrieve Supabase access token from Bitwarden."
  exit 1
}

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

function Invoke-Sql {
  param([string]$Sql, [string]$Label)
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  try {
    $r = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $body
    Write-Host "  OK: $Label" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "  ERROR ($Label): $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      Write-Host "  BODY: $($sr.ReadToEnd())" -ForegroundColor Red
    }
    return $false
  }
}

# Splits SQL into statements at top-level semicolons (preserves $$..$$ blocks).
function Split-Statements {
  param([string]$Sql)
  $cleaned = ($Sql -split "`n" | Where-Object { $_ -notmatch '^\s*--' }) -join "`n"
  $stmts = @()
  $current = ""
  $inDollar = $false
  $i = 0
  while ($i -lt $cleaned.Length) {
    $ch = $cleaned[$i]
    if ($i -lt $cleaned.Length - 1 -and $cleaned[$i] -eq '$' -and $cleaned[$i+1] -eq '$') {
      $inDollar = -not $inDollar
      $current += '$$'
      $i += 2
      continue
    }
    if ($ch -eq ';' -and -not $inDollar) {
      $trimmed = $current.Trim()
      if ($trimmed) { $stmts += $trimmed }
      $current = ""
      $i++
      continue
    }
    $current += $ch
    $i++
  }
  $trimmed = $current.Trim()
  if ($trimmed) { $stmts += $trimmed }
  return $stmts
}

$migrations = @(
  "supabase/migrations/20260508000001_add_account_type_to_profiles.sql",
  "supabase/migrations/20260508000002_create_templates_table.sql",
  "supabase/migrations/20260508000003_add_template_id_to_generated_contents.sql",
  "supabase/migrations/20260508000004_sync_account_type_to_jwt.sql"
)

$allOk = $true
foreach ($mig in $migrations) {
  $name = Split-Path $mig -Leaf
  Write-Host "=== Applying $name ===" -ForegroundColor Cyan
  $sql = Get-Content $mig -Raw
  $stmts = Split-Statements -Sql $sql
  Write-Host "  $($stmts.Count) statements detected"
  $idx = 0
  foreach ($s in $stmts) {
    $idx++
    $preview = $s.Substring(0, [Math]::Min(60, $s.Length)).Replace("`n", " ")
    if (-not (Invoke-Sql -Sql $s -Label "[$idx/$($stmts.Count)] $preview")) {
      $allOk = $false
    }
  }
}

if ($allOk) {
  Write-Host "ALL MIGRATIONS APPLIED" -ForegroundColor Green
} else {
  Write-Host "SOME STATEMENTS FAILED - review output above" -ForegroundColor Yellow
  exit 1
}
