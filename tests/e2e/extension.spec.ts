import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuthResponse, Career, Draft } from '@career/shared';
import { extensionId, extensionKey, extensionOrigin } from '../fixtures/extension-identity';

const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4400';
const origin = process.env.E2E_BASE_URL || apiURL;
const fixtureURL = process.env.E2E_FIXTURE_URL || 'http://localhost:4174';
const password = 'Native-extension-e2e-password-2026!';

async function choose(panel: Page, label: RegExp) {
  const row = panel.locator('#fields .field').filter({ has: panel.getByRole('checkbox', { name: label }) });
  await row.getByRole('checkbox').check();
  return row;
}

test('native MV3 action grants temporary page access; review, grounded assistance, fill, stale-field rejection and zero submissions', async ({ request }) => {
  // Chromium permits backend access in this test copy only. The job fixture uses
  // a DIFFERENT host, so only a real Extensions.triggerAction grants activeTab.
  expect(new URL(apiURL).hostname).not.toBe(new URL(fixtureURL).hostname);
  const temporary = await mkdtemp(join(tmpdir(), 'career-extension-e2e-'));
  let context: BrowserContext | undefined;
  let token = '';
  const email = `extension-${randomUUID()}@example.test`;
  const headers = { Origin: origin };
  try {
    const registered = await request.post(`${apiURL}/api/auth/register`, { headers, data: { email, password, fullName: 'Alex Evidence' } });
    expect(registered.status()).toBe(201);
    token = (await registered.json() as AuthResponse).accessToken;
    const authorized = { ...headers, Authorization: `Bearer ${token}` };
    expect((await request.put(`${apiURL}/api/profile`, { headers: authorized, data: { fullName: 'Alex Evidence', email, phone: '+1 555 010 2026', location: 'Remote', headline: 'Software engineer', summary: 'I build accessible web applications.' } })).ok()).toBeTruthy();
    for (const [section, label, description] of [
      ['skills', 'TypeScript', 'Built typed web applications with TypeScript.'],
      ['experience', 'Frontend engineer', 'Built accessible React forms and browser tests.'],
      ['projects', 'Evidence Library', 'Created a PostgreSQL-backed project library with TypeScript.'],
    ]) expect((await request.post(`${apiURL}/api/profile/${section}`, { headers: authorized, data: { label, description } })).status()).toBe(201);
    const career = await (await request.get(`${apiURL}/api/profile`, { headers: authorized })).json() as Career;
    const evidenceIds = new Set(Object.values(career.sections).flat().map(entry => entry.id));

    const extensionPath = join(temporary, 'extension');
    await cp(resolve('apps/extension/dist'), extensionPath, { recursive: true });
    const shipped = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
    expect(shipped.manifest_version).toBe(3);
    expect(shipped.permissions).toEqual(expect.arrayContaining(['activeTab', 'scripting', 'storage', 'sidePanel']));
    expect(shipped.permissions).not.toContain('tabs');
    expect(shipped.host_permissions || []).toEqual([]);
    expect(shipped.content_scripts || []).toEqual([]);
    // Only the backend origin is pregranted to avoid automating Chrome's native
    // permission dialog. Neither production permissions nor bundle are modified.
    await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify({ ...shipped, key: extensionKey, host_permissions: [`${new URL(apiURL).protocol}//${new URL(apiURL).hostname}/*`] }));
    context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
      channel: 'chromium', headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--enable-unsafe-extension-debugging'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    expect(new URL(worker.url()).host).toBe(extensionId);
    await worker.evaluate(async base => { await chrome.storage.local.set({ apiBase: `${base}/api` }); }, apiURL);
    const fixture = await context.newPage();
    const caseId = randomUUID();
    await fixture.goto(`${fixtureURL}/application?case=${caseId}`);
    await fixture.bringToFront();
    const sourceTab = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!);
    const panel = await context.newPage();
    // Drive the real shipped fallback document. Native side-panel chrome is not
    // a normal Playwright Page; the same panel bundle implements both surfaces.
    await panel.goto(`${extensionOrigin}/panel.html?sourceTab=${sourceTab}`);
    await panel.getByLabel('Email', { exact: true }).fill(email);
    await panel.getByLabel('Password', { exact: true }).fill(password);
    await panel.getByRole('button', { name: /Sign in to your workspace/ }).click();
    await expect(panel.locator('#connected')).toBeVisible();
    await expect(panel.getByLabel('Password', { exact: true })).toHaveValue('');
    await panel.getByRole('button', { name: /Capture this job/ }).click();
    await expect(panel.locator('#status')).toHaveAttribute('data-error', 'true');
    await expect(panel.locator('#fields input[type=checkbox]')).toHaveCount(0);
    expect(await fixture.locator('#full-name').inputValue()).toBe('');

    await fixture.bringToFront();
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
    const targetInfo = targetInfos.find(target => target.url === fixture.url());
    expect(targetInfo, 'Find the actual browser tab target, not its page renderer').toBeTruthy();
    // Browser-native action dispatch invokes the actual service-worker handler
    // and the browser's activeTab grant. No job host permission is added.
    await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: targetInfo!.targetId });
    await panel.bringToFront();
    await panel.getByRole('button', { name: /Capture this job/ }).click();
    await expect(panel.getByLabel('Job title', { exact: true })).toHaveValue('Software Engineer');
    await expect(panel.getByLabel('Job description', { exact: true })).toHaveValue(/Untrusted employer text/);
    await expect(panel.locator('#status')).toContainText('No fields were filled');
    await panel.getByRole('button', { name: 'Save opportunity', exact: true }).click();
    await expect(panel.locator('#status')).toContainText('Opportunity saved');
    await panel.getByRole('button', { name: 'Analyze against verified profile', exact: true }).click();
    await expect(panel.locator('#analysis')).toContainText('TypeScript');
    await panel.getByRole('button', { name: 'Save application', exact: true }).click();
    await expect(panel.locator('#status')).toContainText('Nothing was submitted');
    await panel.getByRole('button', { name: 'Ask Copilot', exact: true }).click();
    await panel.getByLabel('What would you like help with?', { exact: true }).fill('What verified evidence supports my TypeScript experience?');
    const drafted = panel.waitForResponse(r => r.url().endsWith('/api/assist/answer') && r.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Find a grounded answer', exact: true }).click();
    const draftResponse = await drafted;
    expect(draftResponse.ok()).toBeTruthy();
    const draft = await draftResponse.json() as Draft;
    expect(draft.evidence.length).toBeGreaterThan(0);
    for (const evidence of draft.evidence) expect(evidenceIds.has(evidence.id)).toBeTruthy();
    expect(draft.answer).not.toMatch(/20 years|Kubernetes/i);
    await expect(panel.locator('#answer')).toContainText(draft.answer);

    await panel.getByRole('button', { name: 'Review & fill', exact: true }).click();
    const choices = panel.locator('#fields input[type=checkbox]');
    expect(await choices.count()).toBeGreaterThanOrEqual(5);
    await expect(panel.locator('#fields input[type=checkbox]:checked')).toHaveCount(0);
    await expect(panel.locator('#fields')).not.toContainText(/Social Security|Expected salary|Ethnicity|legally authorized|Account password|consent|Upload your resume/i);
    const nameRow = await choose(panel, /^Full name/);
    await expect(nameRow.locator('[aria-label^="Proposed value"]')).toHaveValue('Alex Evidence');
    await choose(panel, /^Email address/);
    await panel.getByRole('button', { name: 'Fill selected fields', exact: true }).click();
    await expect(panel.locator('#fill-confirm')).toBeVisible();
    // Selection and even the first Fill click must not mutate the website.
    await expect(fixture.locator('#full-name')).toHaveValue('');
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fixture.locator('#full-name')).toHaveValue('');
    await panel.getByRole('button', { name: 'Fill selected fields', exact: true }).click();
    await panel.getByRole('button', { name: 'Confirm fill', exact: true }).click();
    await expect(panel.locator('#status')).toContainText('2 field(s) filled');
    await expect(fixture.locator('#full-name')).toHaveValue('Alex Evidence');
    await expect(fixture.locator('#email')).toHaveValue(email);
    for (const id of ['phone', 'location', 'linkedin', 'portfolio', 'answer', 'password', 'ssn', 'salary', 'ethnicity', 'work-authorization', 'resume']) await expect(fixture.locator(`#${id}`)).toHaveValue('');
    await expect(fixture.locator('#consent')).not.toBeChecked();
    await expect(fixture.locator('#hidden-token')).toHaveValue('fixture-token-do-not-modify');
    await expect(fixture.locator('#disabled-field')).toHaveValue('untouched@example.test');

    await panel.getByRole('button', { name: /Capture this job/ }).click();
    await expect(panel.locator('#status')).toContainText('No fields were filled');
    await choose(panel, /^Phone number/);
    await panel.getByRole('button', { name: 'Fill selected fields', exact: true }).click();
    await fixture.locator('#phone').evaluate(node => { node.setAttribute('aria-label', 'Social Security number'); });
    await panel.getByRole('button', { name: 'Confirm fill', exact: true }).click();
    await expect(panel.locator('#status')).toHaveAttribute('data-error', 'true');
    await expect(panel.locator('#status')).toContainText(/changed|safe|Capture again/i);
    await expect(fixture.locator('#phone')).toHaveValue('');
    await expect(fixture.locator('#submission-count')).toHaveText('0');
    const submissions = await request.get(`${fixtureURL}/submissions?case=${caseId}`);
    expect(await submissions.json()).toEqual({ count: 0 });
    expect(await (await request.get(`${apiURL}/api/profile`, { headers: authorized })).json()).toEqual(career);
    const storage = await worker.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null), sync: await chrome.storage.sync.get(null), permissions: await chrome.permissions.getAll() }));
    expect(storage.session.auth.accessToken).toBeTruthy();
    expect(storage.session.auth.refreshToken).toBeTruthy();
    expect(storage.local).toEqual({ apiBase: `${apiURL}/api` });
    expect(storage.sync).toEqual({});
    expect(storage.permissions.origins).not.toContain(`${new URL(fixtureURL).protocol}//${new URL(fixtureURL).hostname}/*`);
    await panel.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(panel.locator('#account')).toBeVisible();
    expect(await worker.evaluate(async () => (await chrome.storage.session.get('auth')).auth)).toBeUndefined();
  } finally {
    if (context) await context.close();
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    if (token) expect((await request.delete(`${apiURL}/api/account`, { headers: { ...headers, Authorization: `Bearer ${token}` }, data: { password } })).status()).toBe(204);
  }
});
