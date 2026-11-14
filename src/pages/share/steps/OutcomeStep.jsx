import { Controller, useWatch } from 'react-hook-form'
import { Check, Clock, Minus, ShieldCheck } from 'lucide-react'
import { DifficultyInput, RadioCards, Textarea, CharCount, Switch, Checkbox, Avatar } from '@/components/ui'
import { OUTCOMES } from '@/lib/constants'
import { DEPARTMENT } from '@/mocks/lookups'
import { LIMITS } from '@/api/drafts'
import { batchLabel, cn } from '@/lib/utils'
import { CField, FormSection, InlineError } from '../parts'

const OUTCOME_ICONS = { selected: Check, awaiting: Clock, not_selected: Minus, withdrew: Minus, undisclosed: Minus }

export function OutcomeStep({ user, config }) {
  const anonymous = useWatch({ name: 'is_anonymous' })
  const hideDept = useWatch({ name: 'hide_department' })
  const deptId = useWatch({ name: 'department_id' })
  const year = useWatch({ name: 'graduation_year' })
  const shownBatch = [!(anonymous && hideDept) && DEPARTMENT[deptId]?.code, batchLabel(Number(year))].filter(Boolean).join(' ')

  return (
    <div className="space-y-10">
      <FormSection>
        <CField
          name="difficulty"
          label="Overall difficulty"
          hint="Across all rounds, compared with other interviews you know of."
          render={(field) => <DifficultyInput ref={field.ref} value={field.value} onChange={field.onChange} />}
        />
        <CField
          name="outcome"
          label="Result"
          render={(field) => (
            <RadioCards
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              columns={3}
              options={OUTCOMES.map((o) => ({ value: o.value, label: o.label, icon: OUTCOME_ICONS[o.value] }))}
            />
          )}
        />
        <CField
          name="advice"
          label="Advice for juniors"
          hint="Recommended. This is what juniors read first."
          counter={(v) => <CharCount value={v ?? ''} max={LIMITS.advice} />}
          render={(field) => (
            <Textarea
              {...field}
              minRows={4}
              placeholder="e.g. Talk through your approach before you code. They cared more about the brute-force → optimal journey than the final answer."
            />
          )}
        />
      </FormSection>

      <FormSection title="Privacy">
        <div className="rounded-lg border border-ink-200 bg-white p-4">
          <Controller
            name="is_anonymous"
            render={({ field }) => (
              <Switch
                id="f-is_anonymous"
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={!config.allow_anonymous}
                label="Post anonymously"
                description={
                  config.allow_anonymous
                    ? 'Readers won’t see your name or profile. Admins can see it only to handle abuse.'
                    : 'Anonymous posting is turned off right now.'
                }
              />
            )}
          />
          <div className={cn('grid transition-[grid-template-rows] duration-[180ms] ease-out-soft', anonymous ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className="min-h-0 overflow-hidden" inert={!anonymous}>
              <div className="ml-1 mt-4 border-l-2 border-ink-200 pl-4">
                <Controller
                  name="hide_department"
                  render={({ field }) => (
                    <Checkbox
                      id="f-hide_department"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      label="Also hide my department"
                      description="Only your batch is shown. Useful when few people from your department interviewed."
                    />
                  )}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-md bg-ink-50 px-3 py-2.5">
            <Avatar name={user?.full_name ?? ''} anonymous={anonymous} size={32} />
            <div className="min-w-0 text-small leading-tight">
              <p className="text-ink-500">Readers will see</p>
              <p className="truncate font-medium text-ink-900">
                {anonymous ? 'Anonymous PSG student' : user?.full_name}
                {shownBatch && <span className="font-normal text-ink-600"> · {shownBatch}</span>}
              </p>
            </div>
          </div>
        </div>
      </FormSection>

      <Controller
        name="confirmed"
        render={({ field, fieldState }) => (
          <div className="space-y-2">
            <div
              data-invalid={fieldState.error ? 'true' : undefined}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 transition-colors duration-[120ms]',
                fieldState.error ? 'border-danger-600 bg-danger-50' : field.value ? 'border-teal-200 bg-teal-50' : 'border-ink-200 bg-white',
              )}
            >
              <ShieldCheck className={cn('mt-0.5 size-5 shrink-0', field.value ? 'text-teal-600' : 'text-ink-500')} aria-hidden />
              <Checkbox
                id="f-confirmed"
                checked={field.value}
                onCheckedChange={field.onChange}
                label="This is my own experience and doesn’t include confidential test content I agreed not to share."
              />
            </div>
            <InlineError message={fieldState.error?.message} />
          </div>
        )}
      />
    </div>
  )
}
