// Supabase Edge Function: manage-instructor
//
// Runs server-side, holds the SERVICE_ROLE_KEY as a Supabase secret (never
// shipped to the browser). Handles the two actions that need elevated
// privileges the browser can never safely have: creating a new instructor
// login, and resetting one back to the default password.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy manage-instructor
//   supabase secrets set DEFAULT_INSTRUCTOR_PASSWORD=123456789mth101
//
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already available inside
// every Edge Function automatically — no need to set those yourself.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const DEFAULT_PASSWORD = Deno.env.get('DEFAULT_INSTRUCTOR_PASSWORD') || '123456789mth101'

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@mth-platform.instructor`
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    // Client scoped to the CALLER's own JWT — used only to verify who's asking.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    // Elevated client — only ever used after confirming the caller is a superadmin.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'superadmin') throw new Error('Only a superadmin can do this.')

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { username, display_name } = body
      if (!username || !display_name) throw new Error('Username and display name are required.')

      const email = usernameToEmail(username)
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password: DEFAULT_PASSWORD, email_confirm: true,
      })
      if (createError) throw new Error(createError.message)

      const { error: profileError } = await adminClient.from('profiles').insert({
        id: created.user.id, username, display_name, role: 'instructor', must_change_password: true,
      })
      if (profileError) {
        // roll back the auth user so we don't leave an orphaned login with no profile
        await adminClient.auth.admin.deleteUser(created.user.id)
        throw new Error(profileError.message)
      }

      return new Response(JSON.stringify({ ok: true, id: created.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password') {
      const { instructor_id } = body
      if (!instructor_id) throw new Error('Missing instructor_id.')

      const { error: pwError } = await adminClient.auth.admin.updateUserById(instructor_id, {
        password: DEFAULT_PASSWORD,
      })
      if (pwError) throw new Error(pwError.message)

      await adminClient.from('profiles').update({ must_change_password: true }).eq('id', instructor_id)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { instructor_id } = body
      if (!instructor_id) throw new Error('Missing instructor_id.')
      const { error: delError } = await adminClient.auth.admin.deleteUser(instructor_id)
      if (delError) throw new Error(delError.message)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })
  }
})
