import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { completeOnboarding, updateProfile } from '@/api/profile'
import { useAuth } from '@/hooks/useAuth'
import { consumeReturnTo } from '@/routes/guards'
import { departmentOptions, TOPICS } from '@/mocks/lookups'
import { DOMAINS, topicsForDomain } from '@/lib/taxonomy'
import { Button, Field, Input, Select, Chip, TagPicker, ProgressBar, useToast } from '@/components/ui'
import { AvatarPicker } from '@/components/AvatarPicker'
import { AuthLayout } from './AuthLayout'

const year = new Date().getFullYear()
const BATCHES = Array.from({ length: 10 }, (_, i) => year - 4 + i)

/* Same rules as the DB CHECK constraints planned for `profiles`. */
const schema = z.object({
  full_name: z.string().trim().min(2, 'Use at least 2 characters.').max(80, 'Use at most 80 characters.'),
  department_id: z.string({ error: 'Choose your department.' }).min(1, 'Choose your department.'),
  graduation_year: z.coerce.number({ error: 'Choose your batch.' }).int().min(year - 4, 'Choose your batch.').max(year + 5),
  avatar_url: z.string().nullable().optional(),
})

export default function Onboarding() {
  const { user, reset } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [step, setStep] = useState(1)
  const [interests, setInterests] = useState([])
  const [topics, setTopics] = useState([])
  const heading = useRef(null)

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { full_name: user?.full_name && !/^\d/.test(user.full_name) ? user.full_name : '', department_id: '', graduation_year: '', avatar_url: null },
  })
  const { register, control, handleSubmit, formState: { errors }, setError, watch } = form

  useEffect(() => { heading.current?.focus() }, [step])

  const finish = useMutation({
    mutationFn: async ({ values, skip }) => {
      const profile = await completeOnboarding({ ...values, interests: skip ? [] : interests, topics: skip ? [] : topics })
      if (values.avatar_url) await updateProfile({ avatar_url: values.avatar_url })
      return profile
    },
    onSuccess: async () => {
      await reset()
      qc.invalidateQueries()
      toast.success('Welcome to PSG InterviewShare.')
      navigate(consumeReturnTo() ?? '/home', { replace: true })
    },
    onError: (e) => {
      if (e.fields) {
        Object.entries(e.fields).forEach(([k, m]) => setError(k, { message: m }))
        setStep(1)
      } else toast.error('Couldn’t save your profile. Try again.')
    },
  })

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <AuthLayout>
      <div className="mb-6 flex items-center gap-3">
        <ProgressBar value={step} max={2} label={`Step ${step} of 2`} />
        <span className="shrink-0 text-caption text-ink-500 tabular">{step} of 2</span>
      </div>

      {step === 1 ? (
        <form
          noValidate
          onSubmit={handleSubmit(() => setStep(2), () => document.querySelector('[aria-invalid="true"]')?.focus())}
          className="animate-step"
        >
          <h1 ref={heading} tabIndex={-1} className="text-h2 outline-none">About you</h1>
          <p className="mt-1.5 text-body text-ink-600">Your department and batch are shown with your experiences so juniors can judge how relevant they are.</p>
          <div className="mt-6 space-y-5">
            <Field label="Full name" error={errors.full_name?.message} required>
              <Input autoComplete="name" {...register('full_name')} />
            </Field>
            <Field label="Department" error={errors.department_id?.message} required>
              <Controller
                control={control}
                name="department_id"
                render={({ field }) => <Select value={field.value} onValueChange={field.onChange} options={departmentOptions()} placeholder="Choose your programme" />}
              />
            </Field>
            <Field label="Batch (graduation year)" error={errors.graduation_year?.message} required>
              <Controller
                control={control}
                name="graduation_year"
                render={({ field }) => (
                  <Select value={field.value ? String(field.value) : ''} onValueChange={field.onChange} options={BATCHES.map((b) => ({ value: String(b), label: `${b}` }))} placeholder="Choose year" />
                )}
              />
            </Field>
            <Field label="Profile photo" optional>
              <Controller control={control} name="avatar_url" render={({ field }) => <AvatarPicker name={watch('full_name')} value={field.value} onChange={field.onChange} />} />
            </Field>
          </div>
          <Button type="submit" size="lg" className="mt-8 w-full">Continue</Button>
        </form>
      ) : (
        <div className="animate-step">
          <h1 ref={heading} tabIndex={-1} className="text-h2 outline-none">What are you preparing for?</h1>
          <p className="mt-1.5 text-body text-ink-600">Optional. We use this only to put relevant experiences first on your home page.</p>
          <fieldset className="mt-6">
            <legend className="mb-2 text-body font-medium text-ink-800">Domains you’re interested in</legend>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.filter((d) => d.value !== 'other').map((d) => (
                <Chip key={d.value} selected={interests.includes(d.value)} onClick={() => toggle(interests, setInterests, d.value)}>{d.label}</Chip>
              ))}
            </div>
          </fieldset>
          <Field label="Topics you’re preparing" optional className="mt-6">
            <TagPicker options={topicsForDomain(interests[0])} value={topics} onChange={setTopics} max={10} placeholder="e.g. Power systems, Graphs" />
          </Field>
          <div className="mt-8 flex gap-3">
            <Button variant="ghost" size="lg" onClick={() => setStep(1)}>Back</Button>
            <div className="flex flex-1 justify-end gap-2">
              <Button variant="secondary" size="lg" onClick={handleSubmit((v) => finish.mutate({ values: v, skip: true }))} disabled={finish.isPending}>Skip</Button>
              <Button size="lg" onClick={handleSubmit((v) => finish.mutate({ values: v }))} loading={finish.isPending}>Finish</Button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
