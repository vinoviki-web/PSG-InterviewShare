#!/usr/bin/env node
/**
 * Phase 5 · live share-wizard integration test against the LOCAL stack.
 * Sends exactly the payload shape the wizard's toPayload() produces
 * (client-side round/question ids, company_slug, `confirmed`, …).
 * Run: npm run db:start && npm run test:wizard
 */
import { check, finish, onboardedStudent, stamp } from './lib.mjs'

console.log('PSG InterviewShare live share-wizard test\n')

const alice = await onboardedStudent('wa', 'Wizard Alice')
const bob = await onboardedStudent('wb', 'Wizard Bob', 'it', 2026)

/** What src/pages/share/schema.js#toPayload sends. */
const wizardPayload = (extra = {}) => ({
  company_slug: 'zoho-corporation',
  new_company_name: null,
  role_title: 'Member Technical Staff',
  opportunity_type: 'full_time',
  hiring_mode: 'on_campus',
  interview_month: '2025-09-01',
  department_id: 'cse',
  graduation_year: 2027,
  eligibility: { cgpa: '7.5', branches: ['cse', 'it'], backlogs: 'no', other: '' },
  application_process: 'Registered through the placement portal.',
  rounds: [
    { id: 'r-client1', round_type: 'aptitude', mode: 'offline', duration_minutes: 60, difficulty: 3, description: 'Pen-and-paper aptitude with C output questions; very tight on time.', questions: [] },
    { id: 'r-client2', round_type: 'coding', mode: 'offline', duration_minutes: 180, difficulty: 4, description: 'Lab round with five problems.',
      questions: [{ id: 'q-client1', body: 'Print a matrix in spiral order.', kind: 'coding', topics: ['arrays'] }] },
  ],
  topics: ['arrays', 'oop'],
  preparation: 'Daily aptitude practice and C output questions.',
  resources: [{ title: 'IndiaBix aptitude', url: 'https://www.indiabix.com/', kind: 'practice' }],
  difficulty: 4,
  outcome: 'selected',
  advice: 'Practise writing code without autocomplete.',
  is_anonymous: false,
  hide_department: false,
  confirmed: true,
  duplicate_of: null,
  duplicate_reason: null,
  ...extra,
})

// ---------------------------------------------------------------- draft + autosave
let draftId
{
  const { data, error } = await alice.rpc('save_draft', { p: { company_slug: 'zoho-corporation', role_title: 'Member Technical Staff', rounds: [], topics: [], resources: [], draft_step: 1 } })
  draftId = data?.id
  check(!error && !!draftId, 'the first meaningful change creates a draft', error?.message)
  const { error: e2 } = await alice.rpc('save_draft', { p: { ...wizardPayload(), id: draftId, draft_step: 3, draft_max_step: 3 } })
  check(!e2, 'autosave stores the full wizard payload (client-side round ids are fine)', e2?.message)
  const { data: row, error: e3 } = await alice.rpc('get_experience_for_editor', { p_id: draftId })
  check(!e3 && row?.status === 'draft', 'the draft reloads into the editor', e3?.message)
  check(row?.company_slug === 'zoho-corporation' && row?.company?.name === 'Zoho Corporation', 'company comes back as slug + name')
  check(row?.rounds?.length === 2 && row.rounds[1].questions[0].body === 'Print a matrix in spiral order.', 'rounds and questions round-trip in order')
  check(JSON.stringify(row?.rounds?.[1]?.questions?.[0]?.topics) === '["arrays"]', 'question topics round-trip as slugs')
  check(row?.eligibility?.cgpa === 7.5 && row?.eligibility?.backlogs === 'no', 'eligibility round-trips (typed)')
  check(row?.draft_step === 3 && row?.draft_max_step === 3 && row?.interview_month === '2025-09-01', 'step and month round-trip in the wizard’s format')
  const { data: drafts } = await alice.from('experiences').select('id').eq('status', 'draft')
  check(drafts?.length === 1, 'the draft is listed only once')
  const { data: peek } = await bob.from('experiences').select('id').eq('id', draftId)
  check((peek ?? []).length === 0, 'another student cannot read the draft')
  const { error: steal } = await bob.rpc('get_experience_for_editor', { p_id: draftId })
  check(steal?.details === 'forbidden', 'another student cannot open the draft in the editor', steal?.details)
}

// ---------------------------------------------------------------- publish
let publishedId = draftId
{
  const { error } = await alice.rpc('publish_experience', {
    p_id: draftId,
    p_changes: wizardPayload({ confirmed: false, rounds: [{ id: 'r-x', round_type: 'hr', description: 'short', questions: [] }] }),
  })
  const fields = error?.hint ? JSON.parse(error.hint) : {}
  check(error?.details === 'validation' && 'rounds.0.description' in fields && 'confirmed' in fields, 'publish returns field errors at the wizard’s paths', JSON.stringify(fields))
  const { data: stillDraft } = await alice.rpc('get_experience_for_editor', { p_id: draftId })
  check(stillDraft?.rounds?.length === 2, 'a failed publish doesn’t touch the saved draft')

  const { data, error: e2 } = await alice.rpc('publish_experience', { p_id: draftId, p_changes: wizardPayload() })
  check(!e2 && data?.status === 'published' && data?.version === 1, 'a complete draft publishes', e2?.message)
  const { data: feed } = await bob.from('experience_feed').select('id, author_name, company_slug').eq('id', draftId)
  check(feed?.[0]?.author_name === 'Wizard Alice' && feed?.[0]?.company_slug === 'zoho-corporation', 'other students see it in the feed with the author’s name')
  const { error: del } = await alice.rpc('delete_draft', { p_id: draftId })
  check(del?.details === 'forbidden', 'the wizard’s “delete draft” can’t remove a published experience', del?.details)
}

// ---------------------------------------------------------------- duplicate drive
{
  const { data: dup } = await alice.rpc('check_duplicate_experience', {
    p_company_id: (await alice.from('companies').select('id').eq('slug', 'zoho-corporation').single()).data.id,
    p_role_title: '  member technical staff ', p_opportunity_type: 'full_time', p_graduation_year: 2027, p_exclude: null,
  })
  check(dup?.id === publishedId, 'the duplicate check finds the same drive (case/space-insensitive)')
  const { data: d2 } = await alice.rpc('save_draft', { p: wizardPayload() })
  const { error } = await alice.rpc('publish_experience', { p_id: d2.id })
  check(error?.details === 'duplicate', 'publishing the same drive again is blocked', error?.details)
  const { data: ok, error: e2 } = await alice.rpc('publish_experience', {
    p_id: d2.id, p_changes: wizardPayload({ duplicate_of: publishedId, duplicate_reason: 'Second attempt through the off-campus drive' }),
  })
  check(!e2 && ok?.status === 'published', 'a different interview for the same drive publishes with a reason', e2?.message)
}

// ---------------------------------------------------------------- edit a published experience
{
  const { data, error } = await alice.rpc('publish_experience', { p_id: publishedId, p_changes: wizardPayload({ advice: 'Updated: practise without autocomplete, and revise DBMS.' }) })
  check(!error && data?.version === 2 && data?.edited === true, 'Update bumps the version and marks it edited', error?.message)
  const { data: row } = await alice.rpc('get_experience_for_editor', { p_id: publishedId })
  check(row?.advice?.startsWith('Updated:'), 'the edit is saved')
}

// ---------------------------------------------------------------- new company + anonymity
{
  const name = `Nimbus Analytics ${stamp}`
  const { data: d } = await bob.rpc('save_draft', {
    p: wizardPayload({ company_slug: null, new_company_name: name, role_title: 'Data Analyst Intern', opportunity_type: 'internship', department_id: 'it', graduation_year: 2026, is_anonymous: true, hide_department: true }),
  })
  const { data, error } = await bob.rpc('publish_experience', { p_id: d.id })
  check(!error && data?.created_company?.name === name, 'publishing with a new company creates it (unverified)', error?.message)
  const { data: co } = await alice.from('companies').select('is_verified').eq('slug', data?.created_company?.slug).single()
  check(co?.is_verified === false, 'the new company starts unverified')
  const { data: feed } = await alice.from('experience_feed').select('author_name, author_id, department_id').eq('id', d.id)
  check(feed?.[0] && feed[0].author_name === null && feed[0].author_id === null && feed[0].department_id === null, 'an anonymous post hides the author and department from others')
}

// ---------------------------------------------------------------- drafts list + delete
{
  const { data: d } = await alice.rpc('save_draft', { p: { company_slug: 'amazon', role_title: 'SDE Intern', rounds: [], topics: [], resources: [] } })
  const { error } = await alice.rpc('delete_draft', { p_id: d.id })
  check(!error, 'a draft can be deleted', error?.message)
  const { data: gone } = await alice.from('experiences').select('id').eq('id', d.id)
  check((gone ?? []).length === 0, 'the deleted draft is gone')
}

finish()
