#!/usr/bin/env bash
# Dunnit: push secrets to Vercel, (re)create the Stripe webhook, write .env.local.
# Run from Git Bash:  bash scripts/setup-env.sh
# Reads (never prints):
#   G:\AI Engineering Journey\.env                       GEMINI_API_KEY, GROQ_API_KEY
#   G:\Vibe Engineering Apps\.secrets\stripe-secret.txt  sk_test_...
#   G:\Vibe Engineering Apps\.secrets\dunnit-cron-secret.txt, dunnit-stripe-price.txt
#   supabase/.temp/project-ref                           written by `supabase link`
set -euo pipefail
export PATH="/c/tools/node24:$PATH"
cd "$(dirname "$0")/.."

SECRETS="/g/Vibe Engineering Apps/.secrets"
JOURNEY_ENV="/g/AI Engineering Journey/.env"
PROD_URL="https://getdunnit.vercel.app"
STRIPE="/c/Users/Dell/AppData/Local/Microsoft/WinGet/Packages/Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe"
APP_NAME="Dunnit"

read_env() { grep -E "^\s*$2\s*=" "$1" | head -1 | sed -E "s/^\s*$2\s*=\s*//; s/^[\"']//; s/[\"']\s*$//" | tr -d '\r'; }
read_secret() { tr -d '\r\n' < "$1"; }

# vercel env add with retries; value via stdin so it never appears in argv.
set_env() { # name value [--sensitive]
  local name="$1" value="$2" flag="${3:-}"
  for target in production preview development; do
    local ok=0
    for attempt in 1 2 3 4; do
      if printf '%s' "$value" | vercel env add "$name" "$target" --force $flag >/dev/null 2>&1; then ok=1; break; fi
      sleep $((5 * attempt))
    done
    [ "$ok" = 1 ] || { echo "FAILED: vercel env add $name $target"; exit 1; }
  done
  echo "  set $name"
}

echo "Collecting values..."
GEMINI=$(read_env "$JOURNEY_ENV" GEMINI_API_KEY)
GROQ=$(read_env "$JOURNEY_ENV" GROQ_API_KEY)
CRON=$(read_secret "$SECRETS/dunnit-cron-secret.txt")
PRICE=$(read_secret "$SECRETS/dunnit-stripe-price.txt")
STRIPE_SECRET=$(read_secret "$SECRETS/stripe-secret.txt")
case "$STRIPE_SECRET" in sk_test_*) ;; *) echo "stripe-secret.txt must hold a test-mode key"; exit 1;; esac
REF=$(read_secret supabase/.temp/project-ref)
KEYS_JSON=$(pnpm exec supabase projects api-keys --project-ref "$REF" -o json 2>/dev/null)
PUBLISHABLE=$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.api_keys||[]);const k=a.find(x=>x.type==="publishable")||a.find(x=>x.name==="anon");console.log(k?k.api_key:"")})')
# service_role first: the sb_secret_ key returned 401 from PostgREST on these projects (2026-10-04).
SECRET_KEY=$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.api_keys||[]);const k=a.find(x=>x.name==="service_role")||a.find(x=>x.type==="secret");console.log(k?k.api_key:"")})')
[ -n "$PUBLISHABLE" ] && [ -n "$SECRET_KEY" ] || { echo "could not read Supabase keys"; exit 1; }
SUPABASE_URL="https://$REF.supabase.co"

echo "Pushing to Vercel (production, preview, development)..."
set_env NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"
set_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$PUBLISHABLE"
set_env SUPABASE_SECRET_KEY "$SECRET_KEY" --sensitive
set_env GOOGLE_GENERATIVE_AI_API_KEY "$GEMINI" --sensitive
set_env GROQ_API_KEY "$GROQ" --sensitive
set_env STRIPE_SECRET_KEY "$STRIPE_SECRET" --sensitive

echo "Recreating the Stripe webhook endpoint for $PROD_URL ..."
for id in $("$STRIPE" webhook_endpoints list --limit 50 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);for(const w of (j.data||[])) if(w.url===process.argv[1]) console.log(w.id)})' "$PROD_URL/api/webhooks/stripe"); do
  "$STRIPE" webhook_endpoints delete "$id" --confirm >/dev/null 2>&1 && echo "  removed $id"
done
CREATED=$("$STRIPE" webhook_endpoints create --url "$PROD_URL/api/webhooks/stripe" \
  --enabled-events checkout.session.completed \
  --enabled-events customer.subscription.created \
  --enabled-events customer.subscription.updated \
  --enabled-events customer.subscription.deleted 2>/dev/null)
WHSEC=$(printf '%s' "$CREATED" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.secret||"")})')
[ -n "$WHSEC" ] || { echo "webhook creation failed"; exit 1; }
echo "  created $(printf '%s' "$CREATED" | grep -oE '"id": "we_[A-Za-z0-9]+"' | head -1)"
set_env STRIPE_WEBHOOK_SECRET "$WHSEC" --sensitive

echo "Writing .env.local..."
cat > .env.local <<EOF
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=$APP_NAME
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE
SUPABASE_SECRET_KEY=$SECRET_KEY
GROQ_API_KEY=$GROQ
GOOGLE_GENERATIVE_AI_API_KEY=$GEMINI
AI_PRIMARY_MODEL=openai/gpt-oss-20b
AI_FALLBACK_MODEL=gemini-3.5-flash-lite
STRIPE_SECRET_KEY=$STRIPE_SECRET
STRIPE_PRICE_PRO_MONTHLY=$PRICE
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=$CRON
EMAIL_FROM=$APP_NAME <onboarding@resend.dev>
EOF
echo "Done. Redeploy with: vercel deploy --prod --yes"
