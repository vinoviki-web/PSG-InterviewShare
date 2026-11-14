#!/usr/bin/env bash
# Waits until the local sign-in service can load our email template.
# Right after `supabase start`, GoTrue may fetch the template before the
# internal template server is up and silently fall back to Supabase's default
# "Confirm your email address" email (no code), which breaks sign-in tests.
set -euo pipefail
project="$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"
container="supabase_auth_${project}"
url="$(docker exec "$container" printenv GOTRUE_MAILER_TEMPLATES_CONFIRMATION)"
for _ in $(seq 1 45); do
  if docker exec "$container" wget -qO- "$url" 2>/dev/null | grep -q "PSG InterviewShare"; then
    echo "Sign-in email template ready."
    exit 0
  fi
  sleep 2
done
echo "Sign-in email template not served after 90 seconds ($url)." >&2
exit 1
