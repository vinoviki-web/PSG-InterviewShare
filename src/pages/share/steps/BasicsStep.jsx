import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'
import { Combobox, CompanyLogo, Input, CharCount, RadioCards, Segmented, MonthYearPicker, Select } from '@/components/ui'
import { getRoleSuggestions, LIMITS } from '@/api/drafts'
import { OPPORTUNITY_TYPES, HIRING_MODES } from '@/lib/constants'
import { DOMAIN } from '@/lib/taxonomy'
import { DomainPicker } from '@/components/DomainPicker'
import { departmentOptions } from '@/mocks/lookups'
import { pluralize } from '@/lib/utils'
import { CField, FormSection } from '../parts'

const NEW_KEY = '__new_company'

const OPP_DESCRIPTIONS = {
  internship: 'A summer or semester internship',
  full_time: 'A full-time placement offer',
  intern_ppo: 'Internship with a pre-placement offer',
  intern_fte: 'Internship followed by a full-time role',
}

const thisYear = new Date().getFullYear()
const BATCHES = Array.from({ length: thisYear + 5 - 2016 + 1 }, (_, i) => thisYear + 5 - i).map((y) => ({ value: String(y), label: `${y} (’${String(y).slice(-2)})` }))

export function BasicsStep({ companies, config }) {
  const { setValue } = useFormContext()
  const company = useWatch({ name: 'company' })
  const role = useWatch({ name: 'role_title' })
  const domain = useWatch({ name: 'domain_id' })
  const slug = company && !company.is_new ? company.slug : null

  const { data: roleSuggestions = [] } = useQuery({
    queryKey: ['role-suggestions', slug],
    queryFn: () => getRoleSuggestions(slug),
    enabled: !!slug,
    staleTime: 300_000,
  })

  const items = useMemo(() => {
    const list = companies.map((c) => ({
      value: c.slug,
      label: c.name,
      keywords: c.aliases ?? [],
      verified: c.is_verified,
      meta: [c.industry, c.experience_count ? pluralize(c.experience_count, 'experience') : 'No experiences yet'].filter(Boolean).join(' · '),
    }))
    if (company?.is_new) list.unshift({ value: NEW_KEY, label: company.name, meta: 'New company · added when you publish' })
    return list
  }, [companies, company])

  const depts = useMemo(() => departmentOptions(), [])
  const suggestions = roleSuggestions.filter((r) => r.toLowerCase() !== role.trim().toLowerCase())

  return (
    <div className="space-y-10">
      <FormSection>
        <CField
          name="company"
          label="Company"
          hint={
            company?.is_new
              ? 'New companies are added when you publish and reviewed by moderators.'
              : config.allow_new_companies && !company
                ? 'Can’t find it? Type the full name and add it as a new company.'
                : undefined
          }
          render={(field) => (
            <Combobox
              ref={field.ref}
              items={items}
              value={field.value ? (field.value.is_new ? NEW_KEY : field.value.slug) : null}
              onChange={(v) => {
                if (!v) field.onChange(null)
                else if (v !== NEW_KEY) field.onChange({ slug: v, name: companies.find((c) => c.slug === v)?.name ?? v, is_new: false })
              }}
              onCreate={(name) => field.onChange({ slug: null, name: name.replace(/\s+/g, ' ').trim(), is_new: true })}
              allowCreate={config.allow_new_companies}
              createLabel={(q) => `Add “${q}” as a new company`}
              placeholder="Search companies, e.g. Zoho"
              emptyText="No matching company"
              renderLeading={(o) => (
                <span className="relative">
                  <CompanyLogo name={o.label} size={32} />
                  {o.verified && <BadgeCheck className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-white text-teal-600" aria-hidden />}
                </span>
              )}
            />
          )}
        />

        <div className="space-y-2">
          <CField
            name="role_title"
            label="Role title"
            counter={(v) => <CharCount value={v} max={LIMITS.role_title[1]} />}
            render={(field) => <Input {...field} placeholder={DOMAIN[domain]?.roleExample ?? 'Use the title from the job post'} autoComplete="off" maxLength={LIMITS.role_title[1] + 20} />}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
              <span className="text-small text-ink-500">Popular at {company.name}:</span>
              {suggestions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setValue('role_title', r, { shouldDirty: true, shouldValidate: true })}
                  className="inline-flex h-7 items-center rounded-sm border border-ink-200 bg-white px-2 text-small text-ink-700 transition-colors duration-[120ms] hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        <CField
          name="domain_id"
          label="Domain"
          hint="The field of the role, not your department. An EEE student taking a software job picks Software & IT."
          render={(field) => (
            <DomainPicker ref={field.ref} value={field.value} onValueChange={field.onChange} aria-label="Domain" />
          )}
        />
      </FormSection>

      <FormSection title="Opportunity">
        <CField
          name="opportunity_type"
          label="Opportunity type"
          render={(field) => (
            <RadioCards
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              options={OPPORTUNITY_TYPES.map((o) => ({ value: o.value, label: o.label, description: OPP_DESCRIPTIONS[o.value] }))}
            />
          )}
        />
        <CField
          name="hiring_mode"
          label="Hiring mode"
          render={(field) => (
            <Segmented ref={field.ref} value={field.value} onValueChange={field.onChange} options={HIRING_MODES} className="max-sm:grid! max-sm:grid-cols-2 max-sm:gap-0.5 sm:self-start" />
          )}
        />
        <CField
          name="interview_month"
          label="When did you interview?"
          hint="Month and year are enough."
          render={(field) => <MonthYearPicker ref={field.ref} value={field.value} onChange={field.onChange} />}
        />
      </FormSection>

      <FormSection title="About you" description="Shown with the experience so juniors can judge how relevant it is. Prefilled from your profile.">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
          <CField
            name="department_id"
            label="Department"
            render={(field) => <Select ref={field.ref} value={field.value} onValueChange={field.onChange} options={depts} placeholder="Choose department" />}
          />
          <CField
            name="graduation_year"
            label="Batch"
            render={(field) => <Select ref={field.ref} value={field.value} onValueChange={field.onChange} options={BATCHES} placeholder="Year" />}
          />
        </div>
      </FormSection>
    </div>
  )
}
