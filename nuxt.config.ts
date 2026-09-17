import { AUTH_SESSION_ABSOLUTE_MAX_AGE_SECONDS } from './utils/auth-errors'

export default defineNuxtConfig({
  // Keeps the Nuxt 3 directory shape when the layer is consumed by a Nuxt 4 app.
  srcDir: '.',

  modules: ['nuxt-auth-utils'],

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
