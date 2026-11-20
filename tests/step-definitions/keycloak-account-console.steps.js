'use strict';

// The account console of the realm, where a person manages their own account: its pages by their
// navigation (Personal info; Account security: Signing in, Device activity; Applications), the personal
// info and its save, the authenticators of the one-time codes, the signed-in devices, the applications
// with their access, and signing out of it. It is a single-page app: it signs in with the server's session
// (or shows the login form), then asks the server's account REST API for each page behind a spinner.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

// The pages of the account console: the navigation item, the group it sits in, and its path.
const PAGES = {
  'personal info': { item: 'Personal info', path: '' },
  'signing in': { item: 'Signing in', group: 'Account security', path: 'account-security/signing-in' },
  'device activity': { item: 'Device activity', group: 'Account security', path: 'account-security/device-activity' },
  'linked accounts': { item: 'Linked accounts', group: 'Account security', path: 'account-security/linked-accounts' },
  applications: { item: 'Applications', path: 'applications' },
};

/** Whether the account console is on screen (its "Global" navigation). */
async function inConsole(world) {
  return world.page.url().startsWith(h.accountConsoleUrl(world)) && (await world.page.getByRole('navigation', { name: 'Global' }).isVisible().catch(() => false));
}

/** Wait until the account console is on screen and ready, or fail with what is there. */
async function consoleReady(world) {
  await h.eventually(world, async () => inConsole(world), (yes) => yes, async () => ({
    message: `The account console is not on screen: ${(await h.loginPage(world)) === 'login' ? 'the login form is (the browser has no session at the server)' : await h.pageSummary(world)}.`,
    hint: 'Sign in first ("Given I am a logged in user with the "user" user"), or log in on the form the console shows.',
  }));
  await h.ready(world, { strict: true });
}

/** The page of the account console on screen: the navigation item marked current. */
async function currentPage(world) {
  const current = world.page.getByRole('navigation', { name: 'Global' }).locator('[aria-current="page"]').first();
  return h.clean(await current.innerText({ timeout: 2000 }).catch(() => ''));
}

/** The handle of the account the browser is signed in as, for the clean-up. */
function signedInHandle(world) {
  return world.__signInUser || world.__signInAttempt || '';
}

/**
 * Open the realm's account console. With a session at the server it signs in by itself and shows the
 * personal info; without one the server shows its login form first (log in there, and the console opens).
 *
 * Example #1: When I go to the account console
 * Example #2: When we go to the account console
 * Example #3: And I go to the account console
 * Example #4: When I go to the account console
 *               Then I should be on the "Personal info" page of the account console
 * Example #5: When I go to the account console
 *               Then I should be on the login page
 */
When(/^(?:I|we) go to the account console$/, async function () {
  await h.open(this, h.accountConsoleUrl(this));
  await h.eventually(this, async () => (await inConsole(this)) || (await h.loginPage(this)) === 'login', (ok) => ok,
    async () => ({ message: `The account console did not open: ${await h.pageSummary(this)}.`, hint: 'It is at <server>/realms/<realm>/account/; check signInServer in cucumber.js.' }));
  if (await inConsole(this)) await h.ready(this, { strict: true });
});

/**
 * Open a page of the account console from its navigation, as a person does ("Account security" opens to
 * show its pages): "Personal info", "Signing in", "Device activity", "Linked accounts", "Applications".
 *
 * Example #1: When I open "Signing in" in the account console
 * Example #2: When I open "Device activity" in the account console
 * Example #3: When I open "Applications" in the account console
 * Example #4: When I open "Personal info" in the account console
 * Example #5: When we open "Signing in" in the account console
 */
When(/^(?:I|we) open "([^"]*)" in the account console$/, async function (name) {
  const target = PAGES[h.normal(name)];
  if (!target) throw friendly({ message: `The account console has no page "${name}".`, hint: `Its pages: ${Object.values(PAGES).map((p) => `"${p.item}"`).join(', ')}.` });
  if (!(await inConsole(this))) {
    await h.open(this, h.accountConsoleUrl(this) + target.path);
    await consoleReady(this);
    return;
  }
  const nav = this.page.getByRole('navigation', { name: 'Global' });
  const link = nav.getByRole('link', { name: target.item, exact: true });
  if (target.group && !(await link.isVisible().catch(() => false))) {
    await nav.getByRole('button', { name: target.group, exact: true }).click();
  }
  await link.click();
  await this.page.waitForURL((u) => u.toString().replace(/\/$/, '') === (h.accountConsoleUrl(this) + target.path).replace(/\/$/, ''), { timeout: h.budget(this) }).catch(() => {});
  await consoleReady(this);
});

/**
 * The account console shows a page: its navigation marks it as the current one (the page's own heading can
 * read otherwise: "Applications" is headed "Application").
 *
 * Example #1: Then I should be on the "Signing in" page of the account console
 * Example #2: Then I should be on the "Personal info" page of the account console
 * Example #3: Then we should be on the "Device activity" page of the account console
 * Example #4: Then I should be on the "Applications" page of the account console
 * Example #5: And I should be on the "Signing in" page of the account console
 */
Then(/^(?:I|we) should be on the "([^"]*)" page of the account console$/, async function (name) {
  await consoleReady(this);
  const shown = await currentPage(this);
  if (!h.same(shown, name)) throw friendly({ message: `The account console shows "${shown || '(no page)'}", not "${name}".`, hint: 'Open the page with "When I open "…" in the account console".' });
});

/**
 * A field of the personal info holds a value ("Username", "Email", "First name", "Last name").
 *
 * Example #1: Then the personal info should show "user@example.com" as "Email"
 * Example #2: Then the personal info should show "User" as "First name"
 * Example #3: Then the personal info should show "Webship" as "Last name"
 * Example #4: Then the personal info should show "user" as "Username"
 * Example #5: And the personal info should show "editor@example.com" as "Email"
 */
Then(/^the personal info should show "([^"]*)" as "([^"]*)"$/, async function (value, label) {
  await consoleReady(this);
  const input = await h.needField(this, label);
  await h.eventually(this, async () => input.inputValue().catch(() => ''), (v) => h.same(v, value),
    async (v) => ({ message: `The personal info shows "${v}" as "${label}", not "${value}".`, hint: 'The personal info reads the account as the server keeps it.' }), 5000);
});

/**
 * Type a value in a field of the personal info ("Email", "First name", "Last name"). Save it with the next
 * step; the clean-up gives the account back its names and email after the scenario.
 *
 * Example #1: When I set my "First name" to "Webship tester" in the personal info
 * Example #2: When I set my "Last name" to "Tester" in the personal info
 * Example #3: When I set my "First name" to "" in the personal info
 * Example #4: When we set our "First name" to "Webship tester" in the personal info
 * Example #5: When I set my "Email" to "not-an-address" in the personal info
 */
When(/^(?:I|we) set (?:my|our) "([^"]*)" to "([^"]*)" in the personal info$/, async function (label, value) {
  await consoleReady(this);
  const handle = signedInHandle(this);
  if (handle) await h.restoreAccountAfter(this, handle);
  await (await h.needField(this, label)).fill(value);
});

/**
 * Save the personal info ("Save") and wait for the server's answer: the notification "Your account has
 * been updated.", or the error under a field it refused.
 *
 * Example #1: When I save my personal info
 * Example #2: When we save our personal info
 * Example #3: And I save my personal info
 * Example #4: When I save my personal info
 *               Then I should see the success notification "Your account has been updated."
 * Example #5: When I save my personal info
 *               Then the "First name" field should have the error "Please specify 'First name'."
 */
When(/^(?:I|we) save (?:my|our) personal info$/, async function () {
  await consoleReady(this);
  const save = this.page.getByRole('button', { name: 'Save', exact: true });
  const answered = this.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().replace(/\?.*$/, '').replace(/\/$/, '') === h.accountConsoleUrl(this).replace(/\/$/, ''), { timeout: h.budget(this) }).catch(() => null);
  await save.click();
  if (!(await answered)) throw h.fail(this, 'The account console sent no save of the personal info.', 'Look at the screenshot of the failure: a field the console checks itself stops the save.');
  await h.ready(this);
});

/**
 * The page shows a notification: the account console's and the admin console's toasts over the page
 * ("Your account has been updated.", "The password has been reset successfully."), of a kind or of any.
 *
 * Example #1: Then I should see the success notification "Your account has been updated."
 * Example #2: Then I should see the notification "The password has been reset successfully."
 * Example #3: Then we should see the error notification "Could not update account"
 * Example #4: Then I should see the success notification "The password has been reset successfully."
 * Example #5: Then I should see the info notification "Your account has been updated."
 */
Then(/^(?:I|we) should see the (?:(success|error|warning|info) )?notification "([^"]*)"$/, async function (kind, expected) {
  await h.eventually(this, async () => h.alerts(this.page, kind || ''), (shown) => shown.some((t) => h.mentions(t, expected)),
    async (shown) => ({ message: `The page shows no ${kind ? `${kind} ` : ''}notification "${expected}". It shows ${h.listed(shown)}.`, hint: 'The consoles show their notifications over the page for a few seconds after an action.' }), 8000);
});

/** The labels of the authenticators the signing-in page lists. */
async function authenticators(world) {
  const section = world.page.locator('main').getByRole('list', { name: 'credential list' });
  const texts = await section.locator('li').allInnerTexts().catch(() => []);
  return texts.map((t) => h.clean(t.split('\n')[0])).filter((t) => t && !/not set up/i.test(t) && !/^My password$/i.test(t));
}

/**
 * The signing-in page lists an authenticator of the one-time codes by its device name, or does not.
 *
 * Example #1: Then the signing-in page should list the authenticator "Test phone"
 * Example #2: Then the signing-in page should not list the authenticator "Test laptop"
 * Example #3: And the signing-in page should list the authenticator "Test laptop"
 * Example #4: Then the signing-in page should list the authenticator "Second phone"
 * Example #5: But the signing-in page should not list the authenticator "Second phone"
 */
Then(/^the signing-in page should( not)? list the authenticator "([^"]*)"$/, async function (not, label) {
  await consoleReady(this);
  if ((await currentPage(this)) !== 'Signing in') throw friendly({ message: `The account console shows "${await currentPage(this)}", not "Signing in".`, hint: 'Open it first: "When I open "Signing in" in the account console".' });
  await h.eventually(this, async () => authenticators(this), (list) => (not ? !list.some((l) => h.same(l, label)) : list.some((l) => h.same(l, label))),
    async (list) => ({ message: not ? `The signing-in page still lists the authenticator "${label}".` : `The signing-in page does not list the authenticator "${label}". It lists ${h.listed(list)}.`, hint: 'The page lists the one-time codes under "Two-factor authentication", by the device name given when each was set up.' }), 8000);
});

/**
 * Start setting a one-time code up from the signing-in page ("Set up Authenticator application"): the
 * server shows its set-up page ("Mobile Authenticator Setup"); finish it with "I set up a one-time code
 * named "…"", which brings the browser back to the console.
 *
 * Example #1: When I start setting up an authenticator in the account console
 * Example #2: When we start setting up an authenticator in the account console
 * Example #3: And I start setting up an authenticator in the account console
 * Example #4: When I start setting up an authenticator in the account console
 *               Then I should be asked to set up a one-time code
 * Example #5: When I start setting up an authenticator in the account console
 *               And I set up a one-time code named "Second phone"
 */
When(/^(?:I|we) start setting up an authenticator in the account console$/, async function () {
  if ((await currentPage(this).catch(() => '')) !== 'Signing in') {
    await h.open(this, `${h.accountConsoleUrl(this)}${PAGES['signing in'].path}`);
    await consoleReady(this);
  }
  const button = this.page.getByRole('button', { name: 'Set up Authenticator application', exact: true });
  await button.waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.navigating(this, () => button.click());
  await h.expectLoginPage(this, 'set up a one-time code', 'The console sends the browser to the server\'s set-up page.');
});

/**
 * Delete an authenticator the scenario set up, from the signing-in page: its "Delete", then the server's
 * question "Do you want to delete <device>?" answered with "Confirm deletion". The step refuses an
 * authenticator the account had before the scenario: a suite takes away only what it made.
 *
 * Example #1: When I delete the authenticator "Second phone" in the account console
 * Example #2: When we delete the authenticator "Second phone" in the account console
 * Example #3: When I delete the authenticator "Test laptop" in the account console
 * Example #4: And I delete the authenticator "Second phone" in the account console
 * Example #5: When I delete the authenticator "Work phone" in the account console
 */
When(/^(?:I|we) delete the authenticator "([^"]*)" in the account console$/, async function (label) {
  const handle = signedInHandle(this);
  if (!handle) throw friendly({ message: 'The step does not know whose authenticator this is.', hint: 'Sign in with "Given I am a logged in user with the "…" user" first.' });
  const { api, user } = await h.adminUser(this, handle);
  const creds = await api.call('GET', `/users/${user.id}/credentials`);
  const target = (Array.isArray(creds.json) ? creds.json : []).find((c) => c.type === 'otp' && h.same(c.userLabel || '', label));
  if (!target) throw friendly({ message: `"${handle}" has no authenticator "${label}".`, hint: 'Name it by the device name the signing-in page lists.' });
  if (h.keptCredential(this, handle, target.id) !== false) {
    throw friendly({ message: `The authenticator "${label}" was there before the scenario: a suite deletes only what it made.`, hint: 'Set an authenticator up in the scenario first ("I set up a one-time code named "…""), then delete that one.' });
  }
  if ((await currentPage(this).catch(() => '')) !== 'Signing in') {
    await h.open(this, `${h.accountConsoleUrl(this)}${PAGES['signing in'].path}`);
    await consoleReady(this);
  }
  const row = this.page.locator('main').getByRole('listitem').filter({ hasText: label });
  await h.navigating(this, () => row.getByRole('button', { name: 'Delete', exact: true }).first().click());
  const confirm = this.page.getByRole('button', { name: 'Confirm deletion', exact: true }).or(this.page.locator('#kc-accept')).first();
  await confirm.waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.navigating(this, () => confirm.click());
  await consoleReady(this);
});

/**
 * The device activity shows the browser's own session ("Current session") with an app among its clients.
 *
 * Example #1: Then the device activity should show the current session with "Webship test app"
 * Example #2: Then the device activity should show the current session with "Account Console"
 * Example #3: And the device activity should show the current session with "Webship partner app"
 * Example #4: Then the device activity should show the current session with "Webship test app"
 * Example #5: But the device activity should show the current session with "Account Console"
 */
Then(/^the device activity should show the current session with "([^"]*)"$/, async function (app) {
  await consoleReady(this);
  if ((await currentPage(this)) !== 'Device activity') throw friendly({ message: `The account console shows "${await currentPage(this)}", not "Device activity".`, hint: 'Open it first: "When I open "Device activity" in the account console".' });
  const sessions = this.page.locator('main').getByRole('list', { name: 'Signed in devices' }).getByRole('listitem');
  const current = sessions.filter({ hasText: 'Current session' }).first();
  if (!(await current.isVisible().catch(() => false))) throw h.fail(this, 'The device activity shows no "Current session".', 'The console marks the browser\'s own session "Current session".');
  const text = h.clean(await current.innerText());
  const clients = ((text.match(/Clients\s+(.*?)\s+Started/i) || [])[1] || '').split(/,\s*/);
  if (!clients.some((c) => h.same(c, app))) throw friendly({ message: `The current session lists the clients ${h.listed(clients)}, not "${app}".`, hint: 'A session lists the apps the account signed in to with it.' });
});

/** The applications the console lists: [{ name, type, status }]. */
async function applications(world) {
  const rows = world.page.locator('main').getByRole('list', { name: 'Application' }).locator(':scope > li');
  const out = [];
  for (const text of await rows.allInnerTexts().catch(() => [])) {
    const parts = text.split('\n').map(h.clean).filter(Boolean);
    if (!parts.length || h.same(parts[0], 'Name')) continue;
    out.push({ name: parts[0], type: parts[1] || '', status: parts[2] || '' });
  }
  return out;
}

/**
 * The applications page lists an app with its type ("Internal", "Third-party"), or lists it at all.
 *
 * Example #1: Then the applications should list "Webship partner app" as "Third-party"
 * Example #2: Then the applications should list "Webship test app" as "Internal"
 * Example #3: Then the applications should list "Account Console"
 * Example #4: Then the applications should not list "Webship partner app"
 * Example #5: And the applications should list "Webship test app"
 */
Then(/^the applications should( not)? list "([^"]*)"(?: as "([^"]*)")?$/, async function (not, app, type) {
  await consoleReady(this);
  await h.eventually(this, async () => applications(this), (list) => {
    const row = list.find((a) => h.same(a.name, app));
    if (not) return !row;
    return row && (!type || h.same(row.type, type));
  }, async (list) => ({
    message: not ? `The applications page still lists "${app}".` : `The applications page does not list "${app}"${type ? ` as "${type}"` : ''}. It lists ${h.listed(list.map((a) => `${a.name} (${a.type})`))}.`,
    hint: 'It lists the apps the account signed in to or granted access to; open it with "When I open "Applications" in the account console".',
  }), 8000);
});

/** Open the details of an app on the applications page; returns its region. */
async function appDetails(world, app) {
  const row = world.page.locator('main').getByRole('list', { name: 'Application' }).locator(':scope > li').filter({ hasText: app }).first();
  if (!(await row.isVisible().catch(() => false))) throw h.fail(world, `The applications page does not list "${app}".`, 'Open it with "When I open "Applications" in the account console".');
  const toggle = row.getByRole('button', { name: 'Application Details' }).first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const region = row.getByRole('region').first();
  await region.waitFor({ state: 'visible', timeout: 5000 });
  return region;
}

/**
 * The details of an app on the applications page say it has an access (a scope by the words a person
 * reads, under "Has access to").
 *
 * Example #1: Then "Webship partner app" should have access to "Email address"
 * Example #2: Then "Webship partner app" should have access to "User profile"
 * Example #3: And "Webship partner app" should have access to "User roles"
 * Example #4: Then "Webship test app" should have access to "Email address"
 * Example #5: But "Webship partner app" should have access to "Email"
 */
Then(/^"([^"]*)" should have access to "([^"]*)"$/, async function (app, access) {
  await consoleReady(this);
  const region = await appDetails(this, app);
  const text = h.clean(await region.innerText());
  const granted = ((text.match(/Has access to\s+(.*?)(?:\s+Access granted on|$)/i) || [])[1] || '');
  if (!h.mentions(granted, access)) throw friendly({ message: `"${app}" has access to "${granted || '(nothing listed)'}", not "${access}".`, hint: 'The details list the scopes the account granted the app.' });
});

/**
 * Take back an app's access from the applications page: its details, "Remove access", and "Confirm" in the
 * dialog. The app no longer has the grant; its consent screen comes again at its next sign-in.
 *
 * Example #1: When I remove the access of "Webship partner app" in the account console
 * Example #2: When we remove the access of "Webship partner app" in the account console
 * Example #3: And I remove the access of "Webship partner app" in the account console
 * Example #4: When I remove the access of "Webship partner app" in the account console
 *               Then the applications should not list "Webship partner app"
 * Example #5: When I remove the access of "Some other app" in the account console
 */
When(/^(?:I|we) remove the access of "([^"]*)" in the account console$/, async function (app) {
  await consoleReady(this);
  const region = await appDetails(this, app);
  const remove = region.getByRole('button', { name: 'Remove access', exact: true });
  if (!(await remove.isVisible().catch(() => false))) throw friendly({ message: `"${app}" has no "Remove access": it has no access the account granted.`, hint: 'Only an app that asked for consent has one.' });
  await remove.click();
  const dialog = this.page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  const answered = this.page.waitForResponse((r) => r.request().method() === 'DELETE' && /\/account\/applications\/[^/]+\/consent/.test(r.url()), { timeout: h.budget(this) }).catch(() => null);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  if (!(await answered)) throw h.fail(this, 'The console did not take the access back (no answer to its request).', 'Look at the screenshot of the failure.');
  await h.ready(this);
});

/**
 * Sign out from the account console's user menu (the account's name, then "Sign out"): the session at the
 * server ends, and the console shows the login form.
 *
 * Example #1: When I sign out of the account console
 * Example #2: When we sign out of the account console
 * Example #3: And I sign out of the account console
 * Example #4: When I sign out of the account console
 *               Then I should not be logged in
 * Example #5: When I sign out of the account console
 *               Then I should be on the login page
 */
When(/^(?:I|we) sign out of the account console$/, async function () {
  await consoleReady(this);
  const header = this.page.getByRole('banner');
  const toggles = header.getByRole('button');
  let opened = false;
  for (let i = (await toggles.count()) - 1; i >= 0; i -= 1) {
    const toggle = toggles.nth(i);
    const name = h.clean(await toggle.innerText().catch(() => ''));
    if (!name || /^navigation$/i.test(name)) continue;
    await toggle.click();
    if (await this.page.getByRole('menuitem', { name: 'Sign out' }).isVisible().catch(() => false)) { opened = true; break; }
    await this.page.keyboard.press('Escape');
  }
  if (!opened) throw h.fail(this, 'The account console\'s header has no user menu with "Sign out".', 'The user menu is the button named by the account\'s name, at the right of the header.');
  const who = await h.signedInAs(this);
  await h.navigating(this, () => this.page.getByRole('menuitem', { name: 'Sign out' }).click());
  await h.eventually(this, async () => h.loginPage(this), (p) => p === 'login', async () => ({ message: `After "Sign out" the console does not show the login form: ${await h.pageSummary(this)}.`, hint: 'The console ends the session and asks for a new login.' }));
  if (who && who.username) h.dropSession(this, who.username);
  this.__signInUser = null;
});

module.exports = { consoleReady, currentPage };
