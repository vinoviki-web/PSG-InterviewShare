import { useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FileQuestion, Lock } from 'lucide-react'
import { Button, EmptyState, ErrorState } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { listAllCompanies } from '@/api/companies'
import { getDraft, getExperienceForEdit, getShareConfig, listMyDrafts, TOTAL_STEPS } from '@/api/drafts'
import { defaultValues, fromRow, isMeaningful } from './schema'
import { clearLocal, localKey, readLocal } from './useAutosave'
import { Wizard } from './Wizard'
import { ConflictPrompt, DraftGate, WizardSkeleton } from './Screens'

const RECENT_DAYS = 30

/**
 * Routes: /share (new, or offer to continue a recent draft),
 * /share/:draftId (resume a draft at its saved step, ?step=N),
 * /share/:id?edit=1 (edit a published experience; "Update" instead of "Publish").
 */
export default function ShareWizard() {
  const { draftId } = useParams()
  const [params] = useSearchParams()
  const loc = useLocation()
  const edit = params.get('edit') === '1'
  const step = Number(params.get('step')) || null
  return <Entry key={`${draftId ?? 'new'}|${edit}|${loc.key}`} id={draftId} edit={edit} stepParam={step} fresh={!!loc.state?.fresh} />
}

async function loadRow(id, edit) {
  try {
    return edit ? await getExperienceForEdit(id) : await getDraft(id)
  } catch (e) {
    if (!edit && e.code === 'published') return getExperienceForEdit(id)
    if (edit && e.code === 'draft') return getDraft(id)
    throw e
  }
}

function Entry({ id, edit, stepParam, fresh }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [choice, setChoice] = useState(fresh ? 'new' : null)
  const [conflict, setConflict] = useState(null)
  // Decisions are frozen on first load: later refetches (autosave invalidates
  // ['drafts']) must never swap the mounted wizard for a gate or prompt.
  const frozen = useRef(null)

  const cfgQ = useQuery({ queryKey: ['share-config'], queryFn: getShareConfig, staleTime: 60_000 })
  const coQ = useQuery({ queryKey: ['companies', 'all'], queryFn: listAllCompanies, staleTime: 60_000 })
  const rowQ = useQuery({ queryKey: ['share-row', id, edit], queryFn: () => loadRow(id, edit), enabled: !!id, staleTime: 0, gcTime: 0, retry: false })
  const draftsQ = useQuery({ queryKey: ['drafts'], queryFn: listMyDrafts, enabled: !id && !fresh })

  const localNew = useMemo(() => {
    if (id) return null
    const l = readLocal(localKey(null))
    return l?.values && isMeaningful(l.values) ? l : null
  }, [id])

  const startNew = () => {
    clearLocal(localKey(null))
    setChoice('new')
  }
  const shareAnother = () => navigate('/share', { state: { fresh: true } })

  /* ---------- Loading & errors (first load only) ---------- */
  if (!frozen.current) {
    const pending = cfgQ.isPending || coQ.isPending || (id ? rowQ.isPending : !fresh && choice == null && draftsQ.isPending)
    if (cfgQ.error || coQ.error) return <LoadError onRetry={() => (cfgQ.refetch(), coQ.refetch())} />
    if (rowQ.error) {
      const code = rowQ.error.code
      if (code === 'not_found' || code === 'forbidden') return <Unavailable forbidden={code === 'forbidden'} onStartNew={shareAnother} />
      return <LoadError onRetry={() => rowQ.refetch()} />
    }
    if (pending) return <WizardSkeleton />
    frozen.current = {
      config: cfgQ.data,
      companies: coQ.data,
      user,
      ...(id ? prepareExisting(rowQ.data, id, user, cfgQ.data) : prepareNew(draftsQ.data, localNew)),
    }
  }
  // Once the editor is up, background refetches (or failures) never replace it.
  const f = frozen.current
  const { config } = f
  const common = { companies: f.companies, config, user: f.user, onShareAnother: shareAnother }

  /* ---------- Existing draft or published experience ---------- */
  if (id) {
    if (f.localNewer && !conflict) {
      return (
        <ConflictPrompt
          localAt={f.local.savedAt}
          serverAt={f.row.updated_at}
          onKeepLocal={() => setConflict('local')}
          onUseServer={() => {
            clearLocal(f.key)
            setConflict('server')
          }}
        />
      )
    }
    const useLocal = f.localNewer && conflict === 'local'
    const maxStep = f.mode === 'edit' ? TOTAL_STEPS : Math.max(f.row.draft_max_step ?? 1, f.row.draft_step ?? 1, useLocal ? f.local.maxStep ?? 1 : 1)
    const saved = useLocal ? f.local.step : f.mode === 'edit' ? 1 : f.row.draft_step ?? 1
    const step = stepParam && stepParam >= 1 && stepParam <= maxStep ? stepParam : Math.min(saved, maxStep)
    return (
      <Wizard
        {...common}
        mode={f.mode}
        draftId={id}
        initialValues={useLocal ? { ...f.serverValues, ...f.local.values } : f.serverValues}
        syncOnMount={useLocal && f.mode === 'draft'}
        initialStep={step}
        initialMaxStep={maxStep}
        updatedAt={f.row.updated_at}
      />
    )
  }

  /* ---------- /share: continue a recent draft, or start new ---------- */
  if (choice == null && f.showGate) {
    return (
      <DraftGate
        drafts={f.recent}
        local={localNew && { company: localNew.values.company?.name, role: localNew.values.role_title, step: localNew.step ?? 1 }}
        onContinue={(draftId) => navigate(`/share/${draftId}`)}
        onContinueLocal={() => setChoice('local')}
        onStartNew={startNew}
      />
    )
  }
  if (choice === 'local' && localNew) {
    return (
      <Wizard
        {...common}
        mode="draft"
        initialValues={{ ...defaultValues(f.user, config), ...localNew.values }}
        syncOnMount
        initialStep={localNew.step ?? 1}
        initialMaxStep={localNew.maxStep ?? localNew.step ?? 1}
      />
    )
  }
  return <Wizard {...common} mode="draft" initialValues={f.blank ?? (f.blank = defaultValues(f.user, config))} />
}

function prepareExisting(row, id, user, config) {
  const mode = row.status === 'draft' ? 'draft' : 'edit'
  const serverValues = fromRow(row, user, config)
  const key = localKey(id, mode)
  const local = readLocal(key)
  const localNewer = !!local?.values && local.savedAt > row.updated_at && JSON.stringify(local.values) !== JSON.stringify(serverValues)
  return { row, mode, serverValues, key, local, localNewer }
}

function prepareNew(drafts, localNew) {
  const cutoff = Date.now() - RECENT_DAYS * 86400000
  const recent = (drafts ?? []).filter((d) => new Date(d.updated_at).getTime() > cutoff)
  return { recent, showGate: recent.length > 0 || !!localNew }
}

function Unavailable({ forbidden, onStartNew }) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <EmptyState
        icon={forbidden ? Lock : FileQuestion}
        title={forbidden ? 'This isn’t your draft' : 'This draft doesn’t exist'}
        action={
          <>
            <Button onClick={onStartNew}>Start a new experience</Button>
            <Button variant="secondary" asChild>
              <Link to="/home">Go home</Link>
            </Button>
          </>
        }
      >
        {forbidden ? 'You can only edit experiences you shared yourself.' : 'It may have been published or deleted. Published experiences are on your profile.'}
      </EmptyState>
    </div>
  )
}

function LoadError({ onRetry }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10">
      <ErrorState title="Couldn’t load the editor" message="Check your connection and try again. Nothing you’ve written is lost." onRetry={onRetry} />
    </div>
  )
}
