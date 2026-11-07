# One-time setup of the Cloudflare Worker bot. Run from the repo root in PowerShell:
#   npx wrangler login            (once, opens the browser)
#   .\scripts\setup-worker.ps1
# Prompts for each secret (typed locally, never stored in the repo), deploys, and registers the Telegram webhook.

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Read-Secret($name, $hint) {
  $s = Read-Host -AsSecureString "$name ($hint)"
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function Put-Secret($name, $value) { $value | npx wrangler secret put $name | Out-Null; Write-Host "  set $name" }

$botToken   = Read-Secret "TELEGRAM_BOT_TOKEN" "from @BotFather"
$chatId     = Read-Host "TELEGRAM_CHAT_ID (from @userinfobot)"
$openai     = Read-Secret "OPENAI_API_KEY" "sk-..."
$github     = Read-Secret "GITHUB_TOKEN" "fine-grained PAT: Contents read + Actions read/write on your career repo"
$webhookSec = -join ((48..57 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$dashKey    = -join ((48..57 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

Write-Host "Deploying worker..."
# PowerShell 5.1 turns wrangler's stderr warnings into errors if redirected, so capture stdout only.
$deployLog = & cmd /c "npx wrangler deploy 2>nul"
$deployLog | ForEach-Object { Write-Host $_ }
$workerUrl = ($deployLog | Select-String -Pattern "https://[a-z0-9.-]+\.workers\.dev" | Select-Object -First 1).Matches.Value
if (-not $workerUrl) {
  throw "Deploy did not return a workers.dev URL. Register a workers.dev subdomain first: https://dash.cloudflare.com -> Workers & Pages -> Overview -> 'Set up a subdomain', then run this script again."
}

Write-Host "Setting secrets..."
Put-Secret "TELEGRAM_BOT_TOKEN" $botToken
Put-Secret "TELEGRAM_CHAT_ID" $chatId
Put-Secret "OPENAI_API_KEY" $openai
Put-Secret "GITHUB_TOKEN" $github
Put-Secret "WEBHOOK_SECRET" $webhookSec
Put-Secret "DASH_KEY" $dashKey

Write-Host "Registering Telegram webhook..."
$body = @{ url = "$workerUrl/telegram"; secret_token = $webhookSec; allowed_updates = @("message"); drop_pending_updates = $true } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setWebhook" -ContentType "application/json" -Body $body
if (-not $r.ok) { throw "setWebhook failed: $($r | ConvertTo-Json)" }
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/setMyCommands" -ContentType "application/json" -Body (@{ commands = @(
  @{command="top";description="paling cocok"}, @{command="baru";description="2 hari terakhir"}, @{command="remote";description="remote / WFH"},
  @{command="cari";description="cari kata"}, @{command="help";description="bantuan"}) } | ConvertTo-Json -Depth 3) | Out-Null

Write-Host ""
Write-Host "Done."
Write-Host "  Bot:       send /top to your bot in Telegram"
Write-Host "  Dashboard: $workerUrl/?k=$dashKey   (keep this link private)"
