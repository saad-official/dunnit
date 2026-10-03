# Dunnit: wire secrets into Vercel and .env.local.
# Run this yourself (it handles your account keys): right-click > Run with PowerShell,
# or from a terminal:  powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1
#
# Reads:
#   G:\AI Engineering Journey\.env                      -> GEMINI_API_KEY, GROQ_API_KEY
#   G:\Vibe Engineering Apps\.secrets\stripe-secret.txt -> sk_test_... (copy from Stripe Dashboard > Developers > API keys)
#   G:\Vibe Engineering Apps\.secrets\dunnit-cron-secret.txt
#   G:\Vibe Engineering Apps\.secrets\dunnit-stripe-price.txt
#   supabase/.temp/project-ref (written by `supabase link`)
# Creates the Stripe webhook endpoint for the production URL and stores its signing secret.
# Never prints secret values.

$ErrorActionPreference = "Stop"
$env:PATH = "C:\tools\node24;" + $env:PATH
Set-Location (Split-Path -Parent $PSScriptRoot)

$secrets = "G:\Vibe Engineering Apps\.secrets"
$journeyEnv = "G:\AI Engineering Journey\.env"
$prodUrl = "https://getdunnit.vercel.app"
$stripe = "C:\Users\Dell\AppData\Local\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"

function Read-EnvValue($file, $name) {
  if (-not (Test-Path $file)) { throw "Missing $file" }
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { throw "$name not found in $file" }
  return ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"').Trim("'")
}

function Read-Secret($file) {
  if (-not (Test-Path $file)) { throw "Missing $file" }
  return (Get-Content $file -Raw).Trim()
}

function Set-VercelEnv($name, $value, [switch]$Sensitive) {
  foreach ($target in @("production", "preview", "development")) {
    $args = @("env", "add", $name, $target, "--force")
    if ($Sensitive) { $args += "--sensitive" }
    $value | & vercel @args *> $null
  }
  Write-Host "  set $name"
}

Write-Host "Collecting values..."
$gemini = Read-EnvValue $journeyEnv "GEMINI_API_KEY"
$groq = Read-EnvValue $journeyEnv "GROQ_API_KEY"
$cron = Read-Secret "$secrets\dunnit-cron-secret.txt"
$price = Read-Secret "$secrets\dunnit-stripe-price.txt"
$stripeSecret = Read-Secret "$secrets\stripe-secret.txt"
if (-not $stripeSecret.StartsWith("sk_test_")) { throw "stripe-secret.txt must hold a test-mode key (sk_test_...)" }

$ref = Read-Secret "supabase\.temp\project-ref"
$keysJson = & pnpm exec supabase projects api-keys --project-ref $ref -o json | ConvertFrom-Json
$publishable = ($keysJson | Where-Object { $_.type -eq "publishable" } | Select-Object -First 1).api_key
if (-not $publishable) { $publishable = ($keysJson | Where-Object { $_.name -eq "anon" }).api_key }
$secretKey = ($keysJson | Where-Object { $_.type -eq "secret" } | Select-Object -First 1).api_key
if (-not $secretKey) { $secretKey = ($keysJson | Where-Object { $_.name -eq "service_role" }).api_key }
$supabaseUrl = "https://$ref.supabase.co"

Write-Host "Creating Stripe webhook endpoint for $prodUrl ..."
$existing = & $stripe webhook_endpoints list --limit 20 | ConvertFrom-Json
$hook = $existing.data | Where-Object { $_.url -eq "$prodUrl/api/webhooks/stripe" } | Select-Object -First 1
if ($hook) {
  Write-Host "  endpoint exists; a signing secret is only shown at creation. Delete it in the Dashboard and re-run if STRIPE_WEBHOOK_SECRET is unknown."
  $whsec = $null
} else {
  $created = & $stripe webhook_endpoints create --url "$prodUrl/api/webhooks/stripe" `
    --enabled-events checkout.session.completed `
    --enabled-events customer.subscription.created `
    --enabled-events customer.subscription.updated `
    --enabled-events customer.subscription.deleted | ConvertFrom-Json
  $whsec = $created.secret
  Write-Host "  created $($created.id)"
}

Write-Host "Pushing to Vercel (production, preview, development)..."
Set-VercelEnv "NEXT_PUBLIC_SUPABASE_URL" $supabaseUrl
Set-VercelEnv "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" $publishable
Set-VercelEnv "SUPABASE_SECRET_KEY" $secretKey -Sensitive
Set-VercelEnv "GOOGLE_GENERATIVE_AI_API_KEY" $gemini -Sensitive
Set-VercelEnv "GROQ_API_KEY" $groq -Sensitive
Set-VercelEnv "STRIPE_SECRET_KEY" $stripeSecret -Sensitive
if ($whsec) { Set-VercelEnv "STRIPE_WEBHOOK_SECRET" $whsec -Sensitive }

Write-Host "Writing .env.local for local development..."
@"
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Dunnit
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$publishable
SUPABASE_SECRET_KEY=$secretKey
GROQ_API_KEY=$groq
GOOGLE_GENERATIVE_AI_API_KEY=$gemini
AI_PRIMARY_MODEL=openai/gpt-oss-20b
AI_FALLBACK_MODEL=gemini-3.5-flash-lite
STRIPE_SECRET_KEY=$stripeSecret
STRIPE_PRICE_PRO_MONTHLY=$price
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=$cron
EMAIL_FROM=Dunnit <onboarding@resend.dev>
"@ | Out-File -FilePath ".env.local" -Encoding utf8

Write-Host "Done. For local Stripe webhooks run: stripe listen --forward-to localhost:3000/api/webhooks/stripe"
