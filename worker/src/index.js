// SoundCloud token-exchange proxy.
//
// SoundCloud's /oauth/token endpoint requires client_secret in the request body even
// for PKCE flows (confirmed in their current docs: "All clients are currently treated
// as confidential rather than public... there is no self-service option to register as
// a public client"). A static site (guess-the-song's GitHub Pages frontend) can't hold
// a secret safely, so this tiny Worker is the only piece of the app that knows it.
//
// It does exactly one thing: takes an authorization_code or refresh_token grant from
// the browser, adds client_id + client_secret server-side, forwards to SoundCloud, and
// relays the response back. It never logs or echoes the secret, and only ever talks to
// secure.soundcloud.com.

const SOUNDCLOUD_TOKEN_URL = 'https://secure.soundcloud.com/oauth/token'

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : allowed[0] || ''
}

function withCors(request, env, response) {
  const origin = allowedOrigin(request, env)
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Vary', 'Origin')
  return new Response(response.body, { status: response.status, headers })
}

function jsonError(request, env, status, error) {
  return withCors(request, env, new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } }))
}

async function handleToken(request, env) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return jsonError(request, env, 400, 'invalid_request')
  }

  if (!env.SOUNDCLOUD_CLIENT_ID || !env.SOUNDCLOUD_CLIENT_SECRET) {
    return jsonError(request, env, 500, 'server_not_configured')
  }

  const body = new URLSearchParams()
  body.set('client_id', env.SOUNDCLOUD_CLIENT_ID)
  body.set('client_secret', env.SOUNDCLOUD_CLIENT_SECRET)

  if (payload.grant_type === 'authorization_code') {
    if (!payload.code || !payload.code_verifier || !payload.redirect_uri) {
      return jsonError(request, env, 400, 'invalid_request')
    }
    body.set('grant_type', 'authorization_code')
    body.set('code', payload.code)
    body.set('code_verifier', payload.code_verifier)
    body.set('redirect_uri', payload.redirect_uri)
  } else if (payload.grant_type === 'refresh_token') {
    if (!payload.refresh_token) {
      return jsonError(request, env, 400, 'invalid_request')
    }
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', payload.refresh_token)
  } else {
    return jsonError(request, env, 400, 'unsupported_grant_type')
  }

  const scResponse = await fetch(SOUNDCLOUD_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })

  const text = await scResponse.text()
  return withCors(request, env, new Response(text, { status: scResponse.status, headers: { 'Content-Type': 'application/json' } }))
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return withCors(request, env, new Response(null, { status: 204 }))
    }

    const url = new URL(request.url)
    if (url.pathname === '/token' && request.method === 'POST') {
      return handleToken(request, env)
    }

    return jsonError(request, env, 404, 'not_found')
  },
}
