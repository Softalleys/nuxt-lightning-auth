# Migrating

In both cases: install the layer as in the [README](../README.md), register the
redirect URIs it lists, and set the `NUXT_OIDC_*` and `NUXT_SESSION_PASSWORD`
variables. Tokens no longer reach the browser, so anything that read one moves
to `/backend/**` or a server route.

## From @sidebase/nuxt-auth

1. Remove `@sidebase/nuxt-auth` and `next-auth`, the `auth` block in
   `nuxt.config.ts` and the NextAuth handler `server/api/auth/[...].ts`.
2. Replace the variables:

   | Before | After |
   | --- | --- |
   | `NUXT_PUBLIC_OIDC_BASE_URL` | `NUXT_OIDC_ISSUER` |
   | `NUXT_PUBLIC_OIDC_CLIENT_ID` | `NUXT_OIDC_CLIENT_ID` |
   | `NUXT_AUTHENTICATION_SECRET` | `NUXT_SESSION_PASSWORD` |
   | `AUTH_ORIGIN` | `NUXT_OIDC_APP_URL`, only behind a proxy |

3. Replace the calls:

   | Before | After |
   | --- | --- |
   | `useAuth().status`, `data.value.user` | `useUserSession().loggedIn`, `user` |
   | `signIn('lightning', { callbackUrl })` | `useAuthActions().startLogin(returnPath)` |
   | `signOut()` | `useAuthActions().logout()` |
   | `getSession()` polling, `sessionRefresh` | nothing; refresh happens on request |
   | `data.value.accessToken` in a fetch | `$fetch('/backend/...')` |
   | `data.value.entitlements`, `roles` | `GET /api/auth/entitlements` |
   | `globalAppMiddleware: true`, `auth: false` on a page | the layer's global middleware, same `auth: false` |

4. Delete any custom refresh, logout broadcast or recovery code: the layer
   provides it (`useAuthRecovery`, the logout plugin).

## From @nuxt-alt/auth

1. Remove `@nuxt-alt/auth`, the `auth` block in `nuxt.config.ts` and the
   logout callback page.
2. Replace the variables:

   | Before | After |
   | --- | --- |
   | `OIDC_CONFIGURATION` | `NUXT_OIDC_ISSUER` (the issuer, not the discovery URL) |
   | `OIDC_CLIENT_ID` | `NUXT_OIDC_CLIENT_ID` |
   | `OIDC_PKCE_METHOD`, `OIDC_COOKIE_SECURE` | nothing; PKCE is always S256 |

3. Replace the calls:

   | Before | After |
   | --- | --- |
   | `useAuth().loggedIn`, `user` | `useUserSession().loggedIn`, `user` |
   | `loginWith('oidc')` | `useAuthActions().startLogin(returnPath)` |
   | `logout()` | `useAuthActions().logout()` |
   | reading the access token for a fetch | `$fetch('/backend/...')` |
   | `refreshTokens()` | nothing; refresh happens on request |

4. Change the Lightning redirect URI from `<origin>/login` to
   `<origin>/api/auth/callback`.
