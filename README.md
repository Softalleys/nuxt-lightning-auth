# nuxt-lightning-auth

A Nuxt layer that signs users in with Lightning over OIDC. Nitro holds the
session in a sealed cookie, refreshes the access token when a request needs it
and proxies calls to the protected API, so the browser never sees a token.

Works with Nuxt 3.17+ and Nuxt 4. Coming from another auth module: see
[docs/migrating.md](docs/migrating.md).

## Install

```bash
npm install github:Softalleys/nuxt-lightning-auth#v1.1.0
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['@softalleys/nuxt-lightning-auth']
})
```

```bash
NUXT_OIDC_ISSUER=https://accounts.example.com
NUXT_OIDC_CLIENT_ID=
NUXT_OIDC_CLIENT_SECRET=
NUXT_OIDC_PROXY_UPSTREAM=https://api.example.com
NUXT_SESSION_PASSWORD=   # at least 32 characters
```

The application provides the `/login` page (see [Usage](#usage)).

## Register the application in Lightning

| Setting | Value |
| --- | --- |
| Redirect URI | `<origin>/api/auth/callback` |
| Post-logout redirect URI | `<origin>/login` |
| Front-channel logout URI | `<origin>/api/auth/frontchannel-logout` |
| Scopes | `openid profile email offline_access tenant roles groups entitlements applications` |

Lightning must be served from the same site as the application (for example
`accounts.example.com` and `app.example.com`): front-channel logout loads the
application in an iframe, and browsers drop its cookies across sites.

## Configuration

Set `runtimeConfig.oidc` in the application, or the matching environment
variables at run time.

| Key | Environment variable | Meaning |
| --- | --- | --- |
| `oidc.issuer` | `NUXT_OIDC_ISSUER` | Issuer, exactly as it appears in discovery. |
| `oidc.clientId` | `NUXT_OIDC_CLIENT_ID` | Application client id. |
| `oidc.clientSecret` | `NUXT_OIDC_CLIENT_SECRET` | Required for `client_secret_basic`. |
| `oidc.clientAuthMethod` | `NUXT_OIDC_CLIENT_AUTH_METHOD` | `client_secret_basic` (default) or `none` for a public client. |
| `oidc.proxyUpstream` | `NUXT_OIDC_PROXY_UPSTREAM` | Base URL that `/backend/**` forwards to. |
| `oidc.appUrl` | `NUXT_OIDC_APP_URL` | Public origin, when a proxy hides it from the request. |
| `oidc.scope` | `NUXT_OIDC_SCOPE` | Defaults to the scopes above. |
| `oidc.loginPath`, `oidc.postLogoutPath` | `NUXT_OIDC_LOGIN_PATH`, `NUXT_OIDC_POST_LOGOUT_PATH` | Default `/login`. |
| `session.password` | `NUXT_SESSION_PASSWORD` | Seals the session cookie. |
| `session.cookie.secure` | `NUXT_SESSION_COOKIE_SECURE` | `false` only for a site served over plain HTTP, where the browser drops a Secure cookie. Default `true`. The flow and logout cookies follow the request protocol. |

## Usage

Every page requires a session; a page opts out with
`definePageMeta({ auth: false })`. Composables and server utilities are
auto-imported.

**Login page.** Opt out of auth and start the flow; `return` survives the round
trip. After a failed callback, `GET /api/auth/oidc-error` returns the error
once.

```vue
<script setup lang="ts">
definePageMeta({ auth: false })
const { startLogin } = useAuthActions()
const route = useRoute()
</script>

<template>
  <button @click="startLogin(route.query.return as string)">
    Sign in
  </button>
</template>
```

**Session.** `useUserSession()` from `nuxt-auth-utils` exposes `loggedIn` and
`user`: `sub`, `name`, `email`, `picture`, `username`, `tenant`, `tenantId`,
`tenantName`, `tenantPicture`, `impersonated`.

**Calling the API.** Request `/backend/<path>`; Nitro forwards it to
`proxyUpstream` with the bearer token. `401 AUTH_SESSION_EXPIRED` means the
session cannot be refreshed: call `recoverAuthentication()` to send the user
through login. `503 AUTH_REFRESH_UNAVAILABLE` means the issuer is unreachable
for now and the session is kept.

```ts
import { isTerminalAuthSessionResponse } from '@softalleys/nuxt-lightning-auth/utils/auth-errors'

export function useApi() {
  const { recoverAuthentication, markAuthenticationHealthy } = useAuthRecovery()

  return $fetch.create({
    baseURL: '/backend',
    headers: useRequestHeaders(['cookie']),
    onResponse: ({ response }) => {
      if (response.ok)
        markAuthenticationHealthy()
    },
    onResponseError: async ({ response }) => {
      if (isTerminalAuthSessionResponse(response.status, response._data))
        await recoverAuthentication()
    }
  })
}
```

**Server routes.** `requireAccessToken(event)` returns a fresh access token,
`requireTenantContext(event)` the subject and tenant, and
`readEntitlements(event)` the user's entitlements from Lightning. They throw the
same 401 and 503 codes as the proxy.

**Logout.** `useAuthActions().logout()` revokes the refresh token, signs out the
other tabs and redirects to Lightning's end-session endpoint.

| Route | Purpose |
| --- | --- |
| `GET /api/auth/login` | Starts the code flow with PKCE. Accepts `return` and `prompt`. |
| `GET /api/auth/callback` | Exchanges the code and creates the session. |
| `POST /api/auth/logout` | Ends the session and returns the end-session URL. |
| `GET /api/auth/frontchannel-logout` | Front-channel logout. |
| `GET /api/auth/oidc-error` | The last callback error, once. |
| `GET /api/auth/entitlements` | The user's entitlements. |
| `GET /api/auth/applications` | The applications the user can open. |
| `/backend/**` | Proxy to `proxyUpstream` with the bearer token. |

## Behaviour

- **No client timers.** Nothing polls the session, so an idle tab never
  reloads. The token is refreshed inside the request that needs it.
- **Single-flight refresh.** Concurrent requests holding the same refresh token
  share one exchange.
- **Transient versus terminal.** Network failures, 408, 425, 429, 5xx,
  `server_error` and `temporarily_unavailable` keep the session and retry after
  30 seconds. `invalid_grant`, `invalid_client`, `unauthorized_client` and
  `invalid_request` end it.
- **Upstream 401s pass through.** Only the layer's own codes start a new login.
- **Logout tombstones.** A refresh already in flight cannot revive an ended
  session.
- **Absolute lifetime.** A session ends eight days after login, matching
  Lightning's refresh-token lifetime.
- **Small cookie.** Roles and entitlements are read from Lightning on demand,
  never stored in the session; the callback refuses a session larger than the
  browser's 4 KB cookie limit.

Back-channel logout is not implemented; front-channel logout covers browsers.

## Upgrading

Change the tag in `package.json` and run `npm install`. Releases follow semver;
a major release says in its notes what the application has to change.

## Development

```bash
npm install
npm run lint
npm test
```

`test/fixtures/oidc-issuer.ts` is a mock issuer, shipped so applications can use
it in their own tests. To try a change in an application, run
`npm install ../nuxt-lightning-auth` there.

To release, bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v1.1.0 && git push origin main v1.1.0
```
