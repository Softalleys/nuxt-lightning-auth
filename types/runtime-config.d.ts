export {}

// nuxt-auth-utils augments `nuxt/schema` from its own declaration file. Without a
// project-level augmentation of the same module, that one wins and the generated
// runtime config types are dropped, leaving every `useRuntimeConfig()` key `unknown`.
declare module 'nuxt/schema' {
  interface PublicRuntimeConfig {}
}
