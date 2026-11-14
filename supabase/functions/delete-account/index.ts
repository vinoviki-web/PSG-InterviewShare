// Roundwise · Edge Function `delete-account` (D14)
// 1. Identify the caller from their JWT (never from the request body).
// 2. As the caller: prepare_account_deletion(mode) anonymises/removes content
//    (same RLS + audit as any RPC).
// 3. As the service role: remove avatar files, then delete the auth user.
// The service-role key exists only in the Edge Function environment.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',')

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json({ code: 'method_not_allowed' }, 405, headers)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ code: 'unauthenticated', message: 'Sign in first.' }, 401, headers)

  let mode = 'anonymise'
  try {
    const body = await req.json()
    mode = body?.mode === 'delete' ? 'delete' : 'anonymise'
  } catch {
    /* default mode */
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await asUser.auth.getUser()
  if (userErr || !userData?.user) return json({ code: 'unauthenticated', message: 'Your session has expired. Sign in again.' }, 401, headers)
  const user = userData.user

  const { data: prepared, error: rpcErr } = await asUser.rpc('prepare_account_deletion', { p_mode: mode })
  if (rpcErr) {
    const status = rpcErr.details === 'last_admin' ? 409 : rpcErr.details === 'unauthenticated' ? 401 : 400
    return json({ code: rpcErr.details || 'error', message: rpcErr.message }, status, headers)
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: files } = await admin.storage.from('avatars').list(user.id)
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) return json({ code: 'error', message: 'Your content was updated but the account could not be deleted. Try again.' }, 500, headers)

  return json({ ok: true, ...prepared }, 200, headers)
})
