'use strict';

// The admin console of the realm, as its admin uses it: its pages from its navigation, finding a user and
// opening them, their tabs, resetting the password of a test account of the users registry, and the
// realm's clients and roles. It is a single-page app: it signs in with the server's session (an account
// without the admin's rights sees "You do not have permission"), then asks the admin REST API for each
// page behind a spinner. A step waits for the request of its page and for the spinner to go.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

const NO_PERMISSION = /do not have permission to access this resource/i;

/** Whether the admin console is on screen: its "Global" navigation with the current realm. */
async function inConsole(world) {
  return world.page.url().startsWith(h.adminConsoleUrl(world)) && (await world.page.getByRole('navigation', { name: 'Global' }).isVisible().catch(() => false));
}

/** Wait until the admin console is ready, or fail with what is on screen. */
async function consoleReady(world) {
  await h.eventually(world, async () => (await inConsole(world)) || NO_PERMISSION.test(await world.page.locator('body').innerText().catch(() => '')), (ok) => ok,
    async () => ({ message: `The admin console is not on screen: ${(await h.loginPage(world)) === 'login' ? 'the login form is (the browser has no session at the server)' : await h.pageSummary(world)}.`, hint: 'Sign in first as an admin of the realm ("Given I am a logged in user with the "administrator" user").' }));
  if (!(await inConsole(world))) throw friendly({ message: 'The admin console says: "You do not have permission to access this resource".', hint: 'The account signed in has no admin rights in the realm (realm-management roles); sign in as the realm\'s admin.' });
  await h.ready(world, { strict: true });
}

/** Run an action of the console and wait for an answer of the admin REST API whose address `test` accepts, then for the page. */
async function withAnswer(world, test, action, what) {
  const answered = world.page.waitForResponse((r) => { try { return test(r.url(), r.request().method()); } catch { return false; } }, { timeout: h.budget(world) }).catch(() => null);
  await action();
  const response = await answered;
  if (!response) throw h.fail(world, `The admin console got no answer for ${what}.`, 'Look at the screenshot of the failure.');
  await h.ready(world);
  return response;
}

/** The admin REST address of the realm, for matching the console's requests. */
function restOf(world) {
  const { url, realm } = h.server(world);
  return `${url}/admin/realms/${encodeURIComponent(realm)}`;
}

/** Open a page of the console from its navigation, waiting for its request. */
async function openPage(world, item, request) {
  await consoleReady(world);
  const link = world.page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: item, exact: true });
  if (!(await link.isVisible().catch(() => false))) {
    const items = await world.page.getByRole('navigation', { name: 'Global' }).getByRole('link').allInnerTexts();
    throw friendly({ message: `The admin console's navigation has no "${item}". It has ${h.listed(items)}.`, hint: 'Name the page by its navigation item.' });
  }
  // A page already on screen sends no new request when its link is followed again: it stays as it is.
  if (await world.page.getByRole('heading', { name: item, level: 1, exact: true }).isVisible().catch(() => false)) {
    await h.ready(world, { strict: true });
    return;
  }
  const rest = restOf(world);
  if (request) await withAnswer(world, (u) => u.startsWith(rest) && request.test(u.slice(rest.length)), () => link.click(), `the page "${item}"`);
  else await link.click();
  await world.page.getByRole('heading', { name: item, level: 1, exact: true }).waitFor({ state: 'visible', timeout: h.budget(world) }).catch(() => {});
  await h.ready(world, { strict: true });
}

// The navigation items whose page asks the admin REST API for its list at once.
const PAGE_REQUESTS = {
  users: /^\/ui-ext\/brute-force-user\?|^\/users\?/,
  clients: /^\/clients\/?\?/,
  'realm roles': /^\/roles\?/,
};

/**
 * Open the realm's admin console. With a session of an admin of the realm it signs in by itself; without a
 * session the server shows its login form first.
 *
 * Example #1: When I go to the admin console
 * Example #2: When we go to the admin console
 * Example #3: And I go to the admin console
 * Example #4: When I go to the admin console
 *               Then the admin console should show the realm "Webship test sign-in"
 * Example #5: When I go to the admin console
 *               Then I should be on the login page
 */
When(/^(?:I|we) go to the admin console$/, async function () {
  await h.open(this, h.adminConsoleUrl(this));
  await h.eventually(this, async () => (await inConsole(this)) || (await h.loginPage(this)) === 'login' || NO_PERMISSION.test(await this.page.locator('body').innerText().catch(() => '')), (ok) => ok,
    async () => ({ message: `The admin console did not open: ${await h.pageSummary(this)}.`, hint: 'It is at <server>/admin/<realm>/console/; check signInServer in cucumber.js.' }));
  if (await inConsole(this)) await h.ready(this, { strict: true });
});

/**
 * The admin console refuses the account signed in: "You do not have permission to access this resource"
 * (an account without the realm's admin rights). The browser logs the refused request (403).
 *
 * Example #1: Then I should not be allowed into the admin console
 * Example #2: Then we should not be allowed into the admin console
 * Example #3: And I should not be allowed into the admin console
 * Example #4: Then I should not be allowed into the admin console
 *               And I should see "Sign out"
 * Example #5: But I should not be allowed into the admin console
 */
Then(/^(?:I|we) should not be allowed into the admin console$/, async function () {
  await h.eventually(this, async () => h.clean(await this.page.locator('body').innerText().catch(() => '')), (t) => NO_PERMISSION.test(t) || false,
    async (t) => ({ message: (await inConsole(this)) ? 'The admin console let the account in.' : `The admin console does not say "You do not have permission": ${h.clean(t).slice(0, 160)}.`, hint: 'An account without admin rights in the realm sees the console\'s refusal and a "Sign out" button.' }));
});

/**
 * The admin console is open on the realm: its navigation names it as the current realm (by its display
 * name, or its name).
 *
 * Example #1: Then the admin console should show the realm "Webship test sign-in"
 * Example #2: Then the admin console should show the realm "webship"
 * Example #3: And the admin console should show the realm "Webship test sign-in"
 * Example #4: Then the admin console should show the realm "Webship"
 * Example #5: But the admin console should show the realm "Webship test sign-in"
 */
Then(/^the admin console should show the realm "([^"]*)"$/, async function (realm) {
  await consoleReady(this);
  const current = h.clean(await this.page.getByRole('navigation', { name: 'Global' }).getByRole('heading').first().innerText().catch(() => '')).replace(/\s*Current realm\s*$/i, '');
  if (!h.mentions(current, realm) && !h.same(h.server(this).realm, realm)) throw friendly({ message: `The admin console shows the realm "${current}", not "${realm}".`, hint: 'The console of a realm is at <server>/admin/<realm>/console/.' });
});

/**
 * Open a page of the admin console from its navigation ("Users", "Clients", "Realm roles", "Groups",
 * "Sessions", "Realm settings", …) and wait for its list.
 *
 * Example #1: When I open "Users" in the admin console
 * Example #2: When I open "Clients" in the admin console
 * Example #3: When I open "Realm roles" in the admin console
 * Example #4: When we open "Groups" in the admin console
 * Example #5: When I open "Sessions" in the admin console
 */
When(/^(?:I|we) open "([^"]*)" in the admin console$/, async function (item) {
  await openPage(this, item, PAGE_REQUESTS[h.normal(item)]);
});

/** Search the list of the page by its search box (its placeholder), Enter, and wait for the answer of the admin REST API. */
async function search(world, placeholder, text, request) {
  const box = world.page.getByPlaceholder(placeholder, { exact: true });
  await box.waitFor({ state: 'visible', timeout: h.budget(world) });
  await box.fill(text);
  const rest = restOf(world);
  await withAnswer(world, (u) => u.startsWith(rest) && request.test(u.slice(rest.length)), () => box.press('Enter'), `the search for "${text}"`);
}

/** The values of a column of the table of the page (by its label), as a person reads them. */
async function column(world, table, header) {
  return world.page.evaluate(([label, name]) => {
    const t = [...document.querySelectorAll('main table')].find((x) => x.getAttribute('aria-label') === label) || document.querySelector('main table');
    if (!t) return [];
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const index = heads.findIndex((th) => th === name);
    return [...t.querySelectorAll('tbody tr')].map((tr) => (tr.querySelectorAll('td')[index] || {}).textContent || '').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }, [table, header]);
}

/** Open a user in the admin console, as an admin does: the Users page, a search for the username, its link, then its details. */
async function openUser(world, who) {
  const handle = h.handleOf(world, who);
  const username = handle ? h.resolveUser(world, handle).username : who;
  await openPage(world, 'Users', PAGE_REQUESTS.users);
  await search(world, 'Search user', username, /^\/ui-ext\/brute-force-user\?.*search=|^\/users\?.*search=/);
  const link = world.page.locator('main table[aria-label="Users"] tbody').getByRole('link', { name: username, exact: true }).first();
  if (!(await link.isVisible().catch(() => false))) throw friendly({ message: `The user list has no "${username}". It shows ${h.listed(await column(world, 'Users', 'Username'))}.`, hint: 'The realm\'s accounts are made by the build of the site.' });
  const rest = restOf(world);
  await withAnswer(world, (u, m) => m === 'GET' && /^\/users\/[0-9a-f-]+(\?|$)/.test(u.slice(rest.length)) && u.startsWith(rest), () => link.click(), `the user "${username}"`);
  await h.eventually(world, async () => h.heading(world.page), (title) => h.same(title, username), async (title) => ({ message: `The user's page is headed "${title}", not "${username}".`, hint: 'The page is headed by the username once the user is loaded.' }));
  world.__adminUser = handle || username;
}

/**
 * Search the users of the realm (the Users page, its "Search user" box): a search from the start of the
 * username, email or name, as the console does it.
 *
 * Example #1: When I search the users for "user"
 * Example #2: When I search the users for "otp"
 * Example #3: When we search the users for "editor"
 * Example #4: When I search the users for "nobody-at-all"
 * Example #5: When I search the users for "administrator@example.com"
 */
When(/^(?:I|we) search the users for "([^"]*)"$/, async function (text) {
  if (!(await this.page.getByPlaceholder('Search user', { exact: true }).isVisible().catch(() => false))) await openPage(this, 'Users', PAGE_REQUESTS.users);
  await search(this, 'Search user', text, /^\/ui-ext\/brute-force-user\?.*search=|^\/users\?.*search=/);
});

/**
 * The user list of the Users page shows a username, or does not.
 *
 * Example #1: Then the user list should show "user"
 * Example #2: Then the user list should show "otpuser"
 * Example #3: Then the user list should not show "otpuser"
 * Example #4: And the user list should show "editor"
 * Example #5: But the user list should not show "administrator"
 */
Then(/^the user list should( not)? show "([^"]*)"$/, async function (not, username) {
  await consoleReady(this);
  const names = await column(this, 'Users', 'Username');
  const there = names.some((n) => h.same(n, username));
  if (!not && !there) throw friendly({ message: `The user list does not show "${username}". It shows ${h.listed(names)}.`, hint: 'The search finds users from the start of their username, email or name.' });
  if (not && there) throw friendly({ message: `The user list shows "${username}".`, hint: 'Look at the screenshot of the failure.' });
});

/**
 * Open a user of the realm in the admin console, as an admin does: the Users page, a search for the
 * username, the username's link; the step waits for the user's details. A handle of the users registry
 * stands for its username.
 *
 * Example #1: When I open the user "user" in the admin console
 * Example #2: When I open the user "editor" in the admin console
 * Example #3: When I open the user "otpuser" in the admin console
 * Example #4: When we open the user "user" in the admin console
 * Example #5: When I open the user "administrator" in the admin console
 */
When(/^(?:I|we) open the user "([^"]*)" in the admin console$/, async function (who) {
  await openUser(this, who);
});

/**
 * Open a tab of the page on screen ("Details", "Credentials", "Role mapping", "Groups", "Consents",
 * "Sessions") and wait for it.
 *
 * Example #1: When I open the "Credentials" tab
 * Example #2: When I open the "Role mapping" tab
 * Example #3: When I open the "Details" tab
 * Example #4: When we open the "Sessions" tab
 * Example #5: When I open the "Consents" tab
 */
When(/^(?:I|we) open the "([^"]*)" tab$/, async function (name) {
  const tab = this.page.getByRole('tab', { name, exact: true });
  if (!(await tab.isVisible().catch(() => false))) {
    const tabs = await this.page.getByRole('tab').allInnerTexts().catch(() => []);
    throw friendly({ message: `The page has no tab "${name}". It has ${h.listed(tabs)}.`, hint: 'Open a user first ("When I open the user "…" in the admin console").' });
  }
  await tab.click();
  await this.page.getByRole('tabpanel', { name }).waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.ready(this, { strict: true });
});

/**
 * Reset the password of a test account of the users registry from its page in the admin console: the
 * "Credentials" tab, "Reset password", a new password typed twice, "Temporary" off (or on: the account must
 * choose a new password at its next login), "Save", and "Reset password" in the confirmation. The
 * scenario's later steps sign the account in with the new password; the clean-up gives it back the
 * registry's after the scenario. The data administrator's own account is refused.
 *
 * Example #1: When I reset the password of "user" in the admin console
 * Example #2: When I reset the password of "user" in the admin console as a temporary password
 * Example #3: When we reset the password of "editor" in the admin console
 * Example #4: When I reset the password of "otpuser" in the admin console
 * Example #5: When I reset the password of "user" in the admin console
 *               Then I should see the success notification "The password has been reset successfully."
 */
When(/^(?:I|we) reset the password of "([^"]*)" in the admin console( as a temporary password)?$/, async function (handle, temporary) {
  const account = h.resolveUser(this, handle);
  if (handle === (this.parameters && this.parameters.dataAdmin)) throw friendly({ message: `"${handle}" is the data administrator: the steps work as it, so its password is not changed.`, hint: 'Reset the password of another test account of the users registry.' });
  await h.restoreAccountAfter(this, handle);
  const onUser = h.same(this.__adminUser || '', handle) && h.same(await h.heading(this.page), account.username) && (await this.page.getByRole('tab', { name: 'Credentials', exact: true }).isVisible().catch(() => false));
  if (!onUser) await openUser(this, handle);
  const tab = this.page.getByRole('tab', { name: 'Credentials', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
    await this.page.getByRole('tabpanel', { name: 'Credentials' }).waitFor({ state: 'visible', timeout: h.budget(this) });
    await h.ready(this, { strict: true });
  }
  await this.page.getByRole('tabpanel', { name: 'Credentials' }).getByRole('button', { name: 'Reset password', exact: true }).click();
  const dialog = this.page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  const password = h.newPassword();
  await dialog.locator('#password').fill(password);
  await dialog.locator('#passwordConfirmation').fill(password);
  // The switch "Temporary" is a checkbox whose visible toggle covers it: a person clicks the toggle.
  const toggle = dialog.getByRole('checkbox', { name: 'Temporary' }).or(dialog.locator('#temporaryPassword')).first();
  if ((await toggle.isChecked()) !== !!temporary) {
    const visible = dialog.locator('#temporaryPassword ~ .pf-v5-c-switch__toggle').first();
    if (await visible.isVisible().catch(() => false)) await visible.click();
    else await toggle.click({ force: true });
  }
  if ((await toggle.isChecked()) !== !!temporary) throw h.fail(this, `The "Temporary" switch did not turn ${temporary ? 'on' : 'off'}.`, 'Look at the screenshot of the failure.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const confirm = this.page.getByRole('dialog').filter({ hasText: 'Reset password?' });
  await confirm.waitFor({ state: 'visible', timeout: h.budget(this) });
  const rest = restOf(this);
  await withAnswer(this, (u, m) => m === 'PUT' && u.startsWith(rest) && /\/reset-password$/.test(u), () => confirm.getByRole('button', { name: 'Reset password', exact: true }).click(), 'the password reset');
  h.passwordChanged(this, handle, password);
});

/**
 * A field of the open user's details holds a value ("Username", "Email", "First name", "Last name").
 *
 * Example #1: Then the user's details should show "editor@example.com" as "Email"
 * Example #2: Then the user's details should show "editor" as "Username"
 * Example #3: Then the user's details should show "Editor" as "First name"
 * Example #4: And the user's details should show "Webship" as "Last name"
 * Example #5: Then the user's details should show "user@example.com" as "Email"
 */
Then(/^the user's details should show "([^"]*)" as "([^"]*)"$/, async function (value, label) {
  const tab = this.page.getByRole('tab', { name: 'Details', exact: true });
  if (!(await tab.isVisible().catch(() => false))) throw friendly({ message: 'No user is open in the admin console.', hint: 'Open one first ("When I open the user "…" in the admin console").' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
    await h.ready(this, { strict: true });
  }
  const input = await h.needField(this, label);
  await h.eventually(this, async () => input.inputValue().catch(() => ''), (v) => h.same(v, value),
    async (v) => ({ message: `The user's details show "${v}" as "${label}", not "${value}".`, hint: 'The details read the account as the server keeps it.' }), 5000);
});

/**
 * The open user has a role (its "Role mapping" tab, opened by the step when it is not on screen).
 *
 * Example #1: Then the user should have the role "editor"
 * Example #2: Then the user should have the role "default-roles-webship"
 * Example #3: And the user should have the role "editor"
 * Example #4: Then the user should not have the role "editor"
 * Example #5: But the user should not have the role "admin"
 */
Then(/^the user should( not)? have the role "([^"]*)"$/, async function (not, role) {
  const tab = this.page.getByRole('tab', { name: 'Role mapping', exact: true });
  if (!(await tab.isVisible().catch(() => false))) throw friendly({ message: 'No user is open in the admin console.', hint: 'Open one first ("When I open the user "…" in the admin console").' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    const rest = restOf(this);
    await withAnswer(this, (u) => u.startsWith(rest) && /role-mappings|effective-roles|available-roles/.test(u), () => tab.click(), 'the user\'s roles');
  }
  const names = await column(this, '', 'Name');
  const has = names.some((n) => h.same(n, role));
  if (!not && !has) throw friendly({ message: `The user has the roles ${h.listed(names)}, not "${role}".`, hint: 'The roles of the account come from the build of the site.' });
  if (not && has) throw friendly({ message: `The user has the role "${role}".`, hint: 'Look at the screenshot of the failure.' });
});

/**
 * The realm has a client (the Clients page, searched by its client ID) or a realm role (the Realm roles
 * page, searched by its name).
 *
 * Example #1: Then the realm should have the client "webship-app"
 * Example #2: Then the realm should have the role "editor"
 * Example #3: Then the realm should have the client "webship-partner"
 * Example #4: Then the realm should not have the client "no-such-client"
 * Example #5: Then the realm should not have the role "no-such-role"
 */
Then(/^the realm should( not)? have the (client|role) "([^"]*)"$/, async function (not, kind, name) {
  const page = kind === 'client'
    ? { item: 'Clients', placeholder: 'Search for client', request: /^\/clients\/?\?.*(clientId|search)=/, table: 'Clients', header: 'Client ID' }
    : { item: 'Realm roles', placeholder: 'Search role by name', request: /^\/roles\?.*search=/, table: 'Role list', header: 'Role name' };
  await openPage(this, page.item, PAGE_REQUESTS[h.normal(page.item)]);
  await search(this, page.placeholder, name, page.request);
  const names = await column(this, page.table, page.header);
  const there = names.some((n) => h.same(n, name));
  if (!not && !there) throw friendly({ message: `The realm has no ${kind} "${name}": the ${page.item} page shows ${h.listed(names)}.`, hint: `The ${kind}s come from the realm file the build imports.` });
  if (not && there) throw friendly({ message: `The realm has the ${kind} "${name}".`, hint: 'Look at the screenshot of the failure.' });
});

module.exports = { consoleReady, openUser };
