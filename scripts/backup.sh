#!/usr/bin/env bash
# Encrypted logical backup of the PRODUCTION database (Phase 10, DECISIONS LA5).
#
#   SUPABASE_DB_URL     the project's direct connection string (Dashboard → Connect → Session pooler)
#   BACKUP_PASSPHRASE   encrypts the dump (gpg AES-256); keep it in a password manager
#
#   npm run backup                 → backups/<UTC timestamp>/{roles,schema,data}.sql.gz.gpg
#
# Restore (into an EMPTY project): decrypt with `gpg -d file.gpg | gunzip > file.sql`, then
#   psql "$TARGET_DB_URL" -f roles.sql -f schema.sql -c 'set session_replication_role = replica' -f data.sql
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the production connection string}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (backups contain student emails and must be encrypted)}"
case "$SUPABASE_DB_URL" in
  *127.0.0.1*|*localhost*) echo "Refusing: SUPABASE_DB_URL points at the local stack." >&2; exit 2 ;;
esac
command -v gpg >/dev/null || { echo "gpg is required (brew install gnupg / apt install gnupg)." >&2; exit 2; }

SB="$(command -v supabase || echo "npx supabase")"   # needs Docker running (pg_dump runs in a container)
out="backups/$(date -u +%Y-%m-%dT%H%MZ)"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

$SB db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$tmp/roles.sql"
$SB db dump --db-url "$SUPABASE_DB_URL" -f "$tmp/schema.sql"
$SB db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$tmp/data.sql"

for f in roles schema data; do
  gzip -9 -c "$tmp/$f.sql" | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --symmetric --cipher-algo AES256 -o "$out/$f.sql.gz.gpg"
done
# Sanity check: the data dump must decrypt and contain the core tables.
gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d "$out/data.sql.gz.gpg" | gunzip \
  | grep -q 'COPY "public"."experiences"' || { echo "Backup check failed: experiences table missing from data dump." >&2; exit 1; }
ls -lh "$out"
echo "Backup written to $out"
