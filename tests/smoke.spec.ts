import { test, expect } from '@playwright/test';

test('Smoke Test - Login Page Renders', async ({ page }) => {
  await page.goto('/');
  
  // Verify basic UI elements on the login page
  await expect(page).toHaveTitle(/SCARO/i);
  await expect(page.locator('text=Sign in to your account')).toBeVisible();
  
  // Verify email and password fields exist
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});
