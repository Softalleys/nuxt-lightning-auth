# nuxt-lightning-auth

A Nuxt layer that makes an application a Lightning OIDC relying party. The
browser never receives a token: Nitro owns the session, refreshes the access
token on demand and proxies every call to the protected API.

Runs on Nuxt 3 and Nuxt 4. It deliberately declares no `srcDir`: Nuxt 3
defaults it to the layer root and Nuxt 4 falls back to the layer root when the
layer has no `app/` directory, so declaring one would override the consuming
application's own source directory.

## What it provides

| Route | Purpose |
| --- | --- |
| `GET /api/auth/login` | Starts the code flow with PKCE, state and nonce. Accepts `return` and `prompt`. |
| `GET /api/auth/callback` | Validates the response, exchanges the code and creates the session. |
| `POST /api/auth/logout` | Revokes the refresh token, writes a tombstone and returns the end-session URL. |
| `GET /api/auth/frontchannel-logout` | Lightning's front-channel logout endpoint. |
| `GET /api/auth/oidc-error` | Reads the one-shot error cookie set by a failed callback. |
| `GET /api/auth/entitlements` | Reads the entitlement resource named by the access token. |
| `GET /api/auth/applications` | Reads the application list named by the ID token. |
| `/backend/**` | Proxies to the configured upstream with the session bearer token. |

Composables: `useAuthActions` (`startLogin`, `logout`), `useAuthRecovery`.
Server utilities: `requireAccessToken`, `requireTenantContext`.

## Configuration

Set `runtimeConfig.oidc` in the consuming application, or the matching
environment variables at run time.

| Key | Environment variable | Meaning |
| --- | --- | --- |
| `oidc.issuer` | `NUXT_OIDC_ISSUER` | Lightning issuer, exactly as it appears in discovery. |
| `oidc.clientId` | `NUXT_OIDC_CLIENT_ID` | Application client id. |
| `oidc.clientSecret` | `NUXT_OIDC_CLIENT_SECRET` | Required for `client_secret_basic`. |
| `oidc.clientAuthMethod` | `NUXT_OIDC_CLIENT_AUTH_METHOD` | `client_secret_basic` (default) or `none`. |
| `oidc.proxyUpstream` | `NUXT_OIDC_PROXY_UPSTREAM` | Base URL that `/backend/**` forwards to. |
| `oidc.appUrl` | `NUXT_OIDC_APP_URL` | Public origin, used to build redirect URIs behind a proxy. |
| `oidc.loginPath` / `oidc.postLogoutPath` | — | Defaults `/login`. |
| `oidc.scope` | `NUXT_OIDC_SCOPE` | Set it explicitly to what the Lightning application is configured for. |
| `session.password` | `NUXT_SESSION_PASSWORD` | At least 32 characters. Seals the session cookie. |

Register these redirect URIs on the Lightning application: `/api/auth/callback`,
post-logout `/login`, front-channel logout `/api/auth/frontchannel-logout`.

## Behaviour that matters

- **No client timers.** Nothing polls the session, so an idle tab never reloads.
  The access token is refreshed inside the request that needs it.
- **Single-flight refresh.** Concurrent requests holding the same rotating
  refresh token share one exchange, keyed by a digest, never by the token.
- **Transient versus terminal.** `server_error`, `temporarily_unavailable`,
  408, 425, 429, 5xx and network failures keep the credentials and set a 30
  second cooldown, answering `503 AUTH_REFRESH_UNAVAILABLE`. `invalid_grant`,
  `invalid_client`, `unauthorized_client` and `invalid_request` clear them and
  answer `401 AUTH_SESSION_EXPIRED`.
- **A plain upstream 401 is passed through.** Only the layer's own codes start a
  new login, so a legitimate authorization failure still reaches the user.
- **Logout tombstones.** A signed cookie records ended sessions, so a refresh
  that was already in flight cannot resurrect one.
- **Absolute lifetime.** Sessions end eight days after login regardless of
  refresh activity, matching Lightning's absolute refresh-token lifetime.

Back-channel logout needs a server-side store for logout tokens and is not
implemented; front-channel logout covers the browser case.

## Consuming it

```ts
export default defineNuxtConfig({
  extends: ['github:Softalleys/nuxt-lightning-auth#v0.1.0']
})
```

While the repository is not published yet, both applications keep a copy under
`layers/lightning-auth` and select it with:

```ts
export default defineNuxtConfig({
  extends: [process.env.NUXT_LIGHTNING_AUTH_LAYER ?? './layers/lightning-auth']
})
```

Set `NUXT_LIGHTNING_AUTH_LAYER` to the git reference at build time and delete
the local copy.

## Tests

`npm run test:unit` covers refresh classification, single flight, tombstones,
logout events, error mapping and resource-URL validation. `npm run
test:integration` runs the whole flow against the in-repo mock issuer in
`test/fixtures/oidc-issuer.ts`: login, state and nonce mismatch, proxy
authorization, expiry crossing, transient and terminal refresh failures,
absolute expiry, logout, front-channel logout and impersonated sessions.

`test/e2e/auth.spec.ts` runs against a real Lightning instance and needs
`E2E_USERNAME` and `E2E_PASSWORD`.
