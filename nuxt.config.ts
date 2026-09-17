import { createResolver } from '@nuxt/kit'
import { AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS } from './utils/auth-errors'

const { resolve } = createResolver(import.meta.url)

// No `srcDir`: Nuxt 3 defaults it to the layer root, and Nuxt 4 falls back to
// the layer root when no `app/` exists. Declaring it would override the
// consuming Nuxt 4 application's own `app/` srcDir.
export default defineNuxtConfig({
  modules: ['nuxt-auth-utils'],

  hooks: {
    // Nuxt 4 includes only `layers/*/*.d.ts`, so the session augmentation has
    // to be referenced by path to reach the consuming application.
    'prepare:types': ({ references }) => {
      references.push({ path: resolve('types/auth-utils.d.ts') })
    }
  },

  runtimeConfig: {
    oidc: {
      issuer: process.env.NUXT_OIDC_ISSUER ?? '',
      clientId: process.env.NUXT_OIDC_CLIENT_ID ?? '',
      clientSecret: process.env.NUXT_OIDC_CLIENT_SECRET ?? '',
      clientAuthMethod: process.env.NUXT_OIDC_CLIENT_AUTH_METHOD ?? 'client_secret_basic',
      scope: 'openid profile email offline_access tenant roles groups entitlements applications',
      appUrl: process.env.NUXT_OIDC_APP_URL ?? '',
      loginPath: '/login',
      postLogoutPath: '/login',
      proxyUpstream: process.env.NUXT_OIDC_PROXY_UPSTREAM ?? ''
    },

    session: {
      name: 'lightning-auth.session',
      maxAge: AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS,
      cookie: {
        sameSite: 'lax',
        path: '/'
      }
    }
  }
})
