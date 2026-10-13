import { expect, test } from '@playwright/test'

test('title screen links to free mode', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'gitmatic' })).toBeVisible()
  await page.getByRole('link', { name: 'Free mode' }).click()
  await expect(page).toHaveURL(/#\/free$/)
  await expect(page.getByRole('heading', { name: 'Free mode' })).toBeVisible()
})
