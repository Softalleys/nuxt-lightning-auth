import { expect, test } from '@nuxt/test-utils/playwright'

// Requires a local Lightning AppHost and NUXT_OIDC_* pointing at it, plus a test
// user whose password is in E2E_PASSWORD. Run with `npm run test:e2e`.
const username = process.env.E2E_USERNAME ?? ''
const password = process.env.E2E_PASSWORD ?? ''

test.skip(!username || !password, 'E2E_USERNAME and E2E_PASSWORD are required')

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: /ingresar|intentar de nuevo/i }).click()
  await page.getByLabel(/usuario|correo/i).fill(username)
  await page.getByLabel(/contraseña/i).fill(password)
  await page.getByRole('button', { name: /iniciar|entrar/i }).click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'))
}

test('signs in and lands on the application', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' })
  await signIn(page)
  await expect(page).not.toHaveURL(/\/login/)
})

test('keeps no token in the browser', async ({ page }) => {
  await signIn(page)

  const cookies = await page.context().cookies()
  expect(cookies.some(cookie => cookie.name === 'lightning-auth.session')).toBe(true)

  const storage = await page.evaluate(() => JSON.stringify({
    local: { ...window.localStorage },
    session: { ...window.sessionStorage }
  }))
  expect(storage).not.toMatch(/eyJ[\w-]{10,}/)
})

test('crosses an access-token expiry without navigating', async ({ page }) => {
  await signIn(page)
  const url = page.url()

  // The Lightning test application is configured with a one-minute access token.
  await page.waitForTimeout(70_000)
  const response = await page.evaluate(async () =>
    (await fetch('/backend/odata/vehicles?$top=1', { credentials: 'include' })).status)

  expect(response).toBe(200)
  expect(page.url()).toBe(url)
})

test('logs the second tab out when the first one signs out', async ({ page, context }) => {
  await signIn(page)
  const second = await context.newPage()
  await second.goto('/')

  await page.getByRole('button', { name: /cerrar sesión/i }).click()
  await second.waitForURL(/\/login/, { timeout: 15_000 })
})

test('ends the session when Lightning triggers front-channel logout', async ({ page, baseURL }) => {
  await signIn(page)
  const sid = await page.evaluate(async () =>
    (await (await fetch('/api/_auth/session')).json()).fingerprint)
  expect(sid).toBeTruthy()

  await page.goto(`${baseURL}/api/auth/frontchannel-logout?iss=${encodeURIComponent(process.env.NUXT_OIDC_ISSUER!)}&sid=${process.env.E2E_SID ?? ''}`)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
