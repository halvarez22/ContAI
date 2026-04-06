import { test, expect } from '@playwright/test';

test('carga la app y el título ContAI', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ContAI/);
});

test('pantalla inicial: login con Google (importación Excel tras autenticación)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Iniciar Sesión con Google/i })).toBeVisible();
});
