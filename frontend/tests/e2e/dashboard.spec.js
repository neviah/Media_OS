const { test, expect } = require('@playwright/test');

test.describe('Dashboard and Pipeline Controls', () => {
  test('renders dashboard metrics and pipeline buttons', async ({ page }) => {
    await page.route('**/api/workspaces/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/channels/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/avatars/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/videos/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/news-sources/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/scripts/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/audios/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/music/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Build, voice, animate, and publish from one control panel.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run News -> Script' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Script -> Voice' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Voice -> Avatar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Assembly' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Publish' })).toBeVisible();
  });

  test('triggers a pipeline action', async ({ page }) => {
    await page.route('**/api/workspaces/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'WS' }]) });
    });
    await page.route('**/api/channels/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 2, name: 'CH' }]) });
    });
    await page.route('**/api/avatars/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/videos/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 3, title: 'Video' }]) });
    });
    await page.route('**/api/news-sources/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 4, name: 'Source' }]) });
    });
    await page.route('**/api/scripts/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 5, title: 'Script' }]) });
    });
    await page.route('**/api/audios/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 6, path: 'audio.wav' }]) });
    });
    await page.route('**/api/music/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 7, title: 'Track' }]) });
    });

    await page.route('**/api/pipelines/news-to-script', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, script_id: 55, detail: 'news_to_script complete' }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Run News -> Script' }).click();

    await expect(page.getByText('News to Script complete.')).toBeVisible();
  });
});
