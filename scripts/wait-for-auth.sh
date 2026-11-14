#!/usr/bin/env bash
# Waits until the local sign-in service sends OUR email template.
# Right after `supabase start`, GoTrue can load the template before the
# internal template server is up; it then sends Supabase's default
# "Confirm your email address" email (a link, no code) until it re-fetches,
# which happens after a send. So: send warm-up codes to throwaway addresses
# until one arrives with our subject. Local stack only.
set -euo pipefail
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY|MAILPIT_URL)=')"
case "$API_URL" in http://127.0.0.1*|http://localhost*) ;; *) echo "Local stack only." >&2; exit 2 ;; esac
subject='Your PSG InterviewShare sign-in code'
for i in $(seq 1 12); do
  email="warmup$(date +%s)$i@psgtech.ac.in"
  curl -s -o /dev/null -X POST "$API_URL/auth/v1/otp" -H "apikey: $PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"create_user\":true}"
  for _ in $(seq 1 10); do
    got="$(curl -s "$MAILPIT_URL/api/v1/search?query=to:%22$email%22" | grep -o '"Subject":"[^"]*"' | head -1 || true)"
    if [ -n "$got" ]; then break; fi
    sleep 1
  done
  if printf '%s' "$got" | grep -q "$subject"; then
    echo "Sign-in emails use the PSG InterviewShare template."
    exit 0
  fi
  sleep 3
done
echo "Sign-in emails still use the default template after warm-up." >&2
exit 1
