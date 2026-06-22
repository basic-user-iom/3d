import { test, expect } from '@playwright/test'

test.describe('3D viewer smoke', () => {
  test('app shell loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
    await expect(page).toHaveTitle(/3D Model Viewer/i)
  })

  test('viewer canvas is mounted', async ({ page }) => {
    await page.goto('/')
    const canvas = page.locator('#viewer-canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await expect(canvas).toHaveAttribute('role', 'img')
    await expect(canvas).toHaveAttribute('aria-label', /3D model viewer/i)
  })
})
