/**
 * Generates the domains and topics rows of migration 0900 from
 * src/lib/taxonomy.js, so the app and the database can't drift apart.
 *
 *   node scripts/gen-reference-sql.mjs           rewrite the generated blocks
 *   node scripts/gen-reference-sql.mjs --check   exit 1 if they are out of date (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { DOMAINS, TOPICS } from '../src/lib/taxonomy.js'

const FILE = new URL('../supabase/migrations/20261114000900_reference_data.sql', import.meta.url)
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

const blocks = {
  domains: [
    'insert into public.domains (id, name, covers, sort) values',
    DOMAINS.map((d, i) => `  (${q(d.value)}, ${q(d.label)}, ${q(d.covers)}, ${i})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, covers = excluded.covers, sort = excluded.sort;',
  ].join('\n'),
  topics: [
    'insert into public.topics (id, name, group_name, domain_id, sort) values',
    TOPICS.map((t, i) => `  (${q(t.value)}, ${q(t.label)}, ${q(t.group)}, ${q(t.domain)}, ${i})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, group_name = excluded.group_name, domain_id = excluded.domain_id, sort = excluded.sort;',
  ].join('\n'),
}

const ids = TOPICS.map((t) => t.value)
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
if (dupes.length) {
  console.error(`Duplicate topic ids: ${dupes.join(', ')}`)
  process.exit(1)
}

let sql = readFileSync(FILE, 'utf8')
const original = sql
for (const [name, body] of Object.entries(blocks)) {
  const begin = `-- BEGIN GENERATED ${name} (scripts/gen-reference-sql.mjs; edit src/lib/taxonomy.js instead)`
  const end = `-- END GENERATED ${name}`
  const re = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end}`)
  if (!re.test(sql)) {
    console.error(`Marker block "${name}" not found in ${FILE.pathname}`)
    process.exit(1)
  }
  sql = sql.replace(re, `${begin}\n${body}\n${end}`)
}

if (process.argv.includes('--check')) {
  if (sql !== original) {
    console.error('Migration 0900 is out of date with src/lib/taxonomy.js. Run: node scripts/gen-reference-sql.mjs')
    process.exit(1)
  }
  console.log(`Reference data matches taxonomy (${DOMAINS.length} domains, ${TOPICS.length} topics).`)
} else {
  writeFileSync(FILE, sql)
  console.log(`Wrote ${DOMAINS.length} domains and ${TOPICS.length} topics into migration 0900.`)
}
