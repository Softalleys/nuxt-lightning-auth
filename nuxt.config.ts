import { createResolver } from '@nuxt/kit'
import { AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS } from './utils/auth-errors'

const { resolve } = createResolver(import.meta.url)

// No `srcDir`: Nuxt 3 defaults it to the layer root, and Nuxt 4 falls back to
// the layer root when no `app/` exists. Declaring it would override the
// consuming Nuxt 4 application's own `app/` srcDir.
export default defineNuxtConfig({
  modules: ['nuxt-auth-utils'],

  hooks: {
    // A layer installed from npm, or under Nuxt 4, has none of its `.d.ts`
    // files included, so both augmentations are referenced by path.
    'prepare:types': ({ references }) => {
      references.push(
        { path: resolve('types/auth-utils.d.ts') },
        { path: resolve('types/runtime-config.d.ts') }
      )
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
      // nuxt-auth-utils owns this value; naming it keeps the config typed.
      password: process.env.NUXT_SESSION_PASSWORD ?? '',
      name: 'lightning-auth.session',
      maxAge: AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS,
      cookie: {
        sameSite: 'lax',
        path: '/',
        // Browsers drop a Secure cookie on a plain-HTTP origin other than localhost.
        secure: process.env.NUXT_SESSION_COOKIE_SECURE !== 'false'
      }
    }
  }
})
