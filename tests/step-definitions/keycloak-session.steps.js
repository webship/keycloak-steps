'use strict';

// The session at the sign-in server: signing in through the app (or taking over the account's session from
// earlier in the run), the login form and its refusals, "Remember me", the one-time code an account with a
// secret is asked for, logging out, and who the server says is signed in. This file also sets up every page
// the World opens and puts back, after each scenario, what the scenario changed on the server.

const { Given, When, Then, After } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

onNewPage(async (world, page) => {
  world.__signInFailedRequests = [];
  await h.instrument(world, page);
});

After({ name: 'put back what the scenario changed on the sign-in server' }, async function () {
  const problems = await h.runCleanups(this);
  if (problems.length) {
    // A clean-up that failed does not fail the scenario; the build script's ACCOUNTS_ONLY=1 puts the accounts back.
    console.warn(`[keycloak-steps] clean-up: ${problems.join('; ')}`);
  }
});

/** The app's sign-in control: its button, else its link, by the words of cucumber.js (appSignIn.button). */
async function appSignInControl(world) {
  const { button } = h.appSignIn(world);
  if (!button) return null;
  for (const role of ['button', 'link']) {
    const control = world.page.getByRole(role, { name: button, exact: true }).first();
    if (await control.isVisible().catch(() => false)) return control;
  }
  return null;
}

/**
 * Start a sign-in from the app: its start page (appSignIn.path), then its sign-in button when it shows one
 * (an app that sends every visitor to sign in does it by itself). Returns where the browser landed: 'login'
 * (the server's login form), 'app' (the server sent it straight back, or the app signed in by itself: a
 * session was there), or the name of another page of the server. `strict` fails when the app shows no
 * sign-in button and stays where it is (a browser that is not signed in).
 */
async function startSignIn(world, { strict = true } = {}) {
  const { path, button } = h.appSignIn(world);
  // On a page of the app, its own sign-in button starts the sign-in (an app can have several, each with its
  // own client); from anywhere else (a blank page, the server's "You are logged out", an error page) the
  // app's start page does.
  const here = world.page.url();
  const inApp = here.startsWith(h.appRoot(world)) && !h.onServer(world, here);
  if (inApp) {
    await h.appSettled(world);
  } else if ((await h.loginPage(world)) !== 'login') {
    await h.open(world, h.appUrl(world, path));
    await h.appSettled(world);
  }
  let where = await h.loginPage(world);
  if (where) return where;
  const control = await appSignInControl(world);
  if (!control) {
    if (!strict) return 'app';
    throw h.fail(world, `The app shows no "${button}" button or link, and did not send the browser to the sign-in server: ${await h.pageSummary(world)}.`, 'Set worldParameters.appSignIn in cucumber.js to the page of the app that starts a sign-in (path) and the words of its sign-in button or link (button); an app that sends every visitor to sign in needs only the path, with button set to \'\'.');
  }
  await h.navigating(world, () => control.click());
  where = await h.loginPage(world);
  if (!where) await h.appSettled(world);
  return where || 'app';
}

/** Fill the login form in and send it; `remember` ticks "Remember me". */
async function sendLoginForm(world, login, password, { remember = false } = {}) {
  const page = world.page;
  await h.expectLoginPage(world, 'login', 'The login form of the server has the fields "Username or email" (or "Username" or "Email") and "Password".');
  const name = (await h.field(page, 'Username or email')) || (await h.field(page, 'Username')) || (await h.field(page, 'Email'));
  if (!name) throw h.fail(world, `The login form has no "Username or email" field: ${await h.pageSummary(world)}.`, 'A realm that signs in by email only shows an "Email" field; neither is there.');
  await name.fill(login);
  await (await h.needField(world, 'Password')).fill(password);
  if (remember) {
    const box = page.getByRole('checkbox', { name: 'Remember me' });
    if (!(await box.isVisible().catch(() => false))) throw h.fail(world, 'The login form has no "Remember me" box.', 'The realm offers it when its setting "Remember me" is on (realm settings, Sessions).');
    await box.check();
  }
  await h.submitLogin(world, ['Sign In', 'Log In']);
}

/**
 * After the login form: the one-time code when the server asks for it and the account has a secret (as a
 * person types the code of their authenticator app). Returns where the browser is then: '' (back in the
 * app) or the page the server shows (a required action, the consent, a refusal).
 */
async function afterLoginForm(world, account) {
  let where = await h.loginPage(world);
  if (where === 'one-time code' && account.otpSecret) {
    await h.enterComputedCode(world, account.otpSecret, { submit: () => h.submitLogin(world, ['Sign In', 'Log In', 'Submit']) });
    where = await h.loginPage(world);
  }
  return where;
}

/** What the server asks of an account before it lets it in, for an error message. */
const ASKS = {
  'one-time code': 'a one-time code, and the users registry has no otpSecret for it',
  'update password': 'a new password (the required action "Update Password")',
  'verify email': 'to verify its email (the required action "Verify Email")',
  'set up a one-time code': 'to set up a one-time code (the required action "Configure OTP")',
  consent: 'to grant the app access (the consent screen)',
};

/** Sign the browser in through the app as an account of the registry, or take its session over from earlier in the run. */
async function signIn(world, handle) {
  const account = h.resolveUser(world, handle);
  const key = h.sessionKey(world, account.username);
  await h.forgetBrowser(world);
  if (h.reusesSessions(world) && h.SESSIONS.has(key)) {
    await world.context.addCookies(h.SESSIONS.get(key));
    const who = await h.signedInAs(world);
    if (who && h.same(who.username, account.username)) {
      // The app's start page, opened afresh: the app signs in by itself with the session, or its sign-in
      // button sends the browser straight back.
      const where = await startSignIn(world, { strict: false }).catch(() => 'login');
      if (where === 'app') {
        world.__signInUser = handle;
        return;
      }
    }
    h.SESSIONS.delete(key);
    await h.forgetBrowser(world);
  }
  const where = await startSignIn(world);
  if (where !== 'login') throw h.fail(world, `Starting a sign-in did not open the login form: the browser is on the ${where} page.`, 'Start from "Given I am not logged in".');
  await sendLoginForm(world, account.username, account.password);
  const next = await afterLoginForm(world, account);
  if (next === 'login') {
    const messages = await h.pageMessages(world.page);
    throw h.fail(world, `The server refused the login of "${handle}" (${account.username})${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'Check the username and the password of the account in worldParameters.users of cucumber.js; the build of the site makes the accounts (ACCOUNTS_ONLY=1 of the build script gives them back their password).');
  }
  if (next) {
    throw h.fail(world, `The server asks "${handle}" for ${ASKS[next] || `more (its ${next} page)`} before it lets it in.`, 'An account a scenario signs in with must be ready to sign in; for the required actions, use "When I log in as "…" with the login form" and the steps of the page the server shows.');
  }
  await h.keepSession(world, handle);
  world.__signInUser = handle;
}

/**
 * Sign in to the app as an account of the users registry (worldParameters.users) and end on the app: an
 * account that signed in earlier in the run gets its session at the server back; otherwise the app's
 * sign-in button sends the browser to the server's login form, the form is filled in and sent, and an
 * account with a one-time code types the code its secret gives. The browser ends back in the app.
 *
 * Example #1: Given I am a logged in user with the "user" user
 * Example #2: Given I am a logged in user with the "editor" user
 * Example #3: Given I am a logged in user with the "administrator" user
 * Example #4: Given I am a logged in user with the "otpuser" user
 * Example #5: Given we are a logged in user with the "user" user
 */
Given(/^(?:I am|we are) a logged in user with the "([^"]*)" user$/, { timeout: 120000 }, async function (handle) {
  await signIn(this, handle);
});

/**
 * Make the browser a visitor of the app and of the server: its cookies are dropped (the sessions on the
 * server live on for a later scenario), then the app's start page opens.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: When I am not logged in
 * Example #4: Given I am not logged in
 *               And I go to the login page
 * Example #5: Given I am not logged in
 *               Then I should not be logged in
 */
Given(/^(?:I am|we are) not logged in$/, async function () {
  await h.forgetBrowser(this);
  await h.open(this, h.appUrl(this, h.appSignIn(this).path));
  await h.appSettled(this);
});

/**
 * Be a visitor on the server's login form: the browser's cookies dropped, then a sign-in started from the
 * app (its start page and its sign-in button).
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the login page
 * Example #3: Given I am on the login page
 *               When I log in as "user" with the login form
 * Example #4: Given I am on the login page
 *               Then the login should be refused with "Invalid username or password."
 * Example #5: Given I am on the login page
 *               And I go to "/"
 */
Given(/^(?:I am|we are) on the login page$/, async function () {
  await h.forgetBrowser(this);
  const where = await startSignIn(this);
  if (where !== 'login') throw h.fail(this, `Starting a sign-in did not open the login form: the browser is on the ${where} page.`, 'The app sends the browser to the server\'s login form when it is signed out.');
});

/**
 * Start a sign-in from the app as a person does (its start page, its sign-in button) and wait for the
 * server's login form. The browser keeps its session: a browser signed in already is sent straight back,
 * and the step says so.
 *
 * Example #1: When I go to the login page
 * Example #2: When we go to the login page
 * Example #3: And I go to the login page
 * Example #4: When I go to the login page
 *               Then I should be on the login page
 * Example #5: When I go to the login page
 *               And I log in as "user" with the login form
 */
When(/^(?:I|we) go to the login page$/, async function () {
  const where = await startSignIn(this);
  if (where === 'app') {
    const who = await h.signedInAs(this);
    throw h.fail(this, `The server sent the browser straight back to the app: it is signed in${who && who.username ? ` as ${who.username}` : ''}.`, 'Log out first ("When I log out"), or start from "Given I am not logged in".');
  }
  if (where !== 'login') throw h.fail(this, `Starting a sign-in did not open the login form: the browser is on the ${where} page.`, 'The app sends the browser to the server\'s login form when it is signed out.');
});

/**
 * Log in through the server's login form as an account of the users registry, as a person does: the form
 * (a sign-in is started from the app when the browser is not on it), the username and the password,
 * "Remember me" when asked, "Sign In", and the one-time code when the server asks for one and the account
 * has a secret. The browser ends back in the app, or on the page the server shows next (a required action,
 * the consent screen); a refused login fails the step.
 *
 * Example #1: When I log in as "user" with the login form
 * Example #2: When I log in as "editor" with the login form
 * Example #3: When I log in as "otpuser" with the login form
 * Example #4: When I log in as "user" with the login form and "Remember me" checked
 * Example #5: When we log in as "administrator" with the login form
 */
When(/^(?:I|we) log in as "([^"]*)" with the login form( and "Remember me" checked)?$/, { timeout: 120000 }, async function (handle, remember) {
  const account = h.resolveUser(this, handle);
  if ((await h.loginPage(this)) !== 'login') {
    const where = await startSignIn(this);
    if (where === 'app') throw h.fail(this, 'The server sent the browser straight back to the app: it is signed in already.', 'Start from "Given I am not logged in", or log out first.');
  }
  await sendLoginForm(this, account.username, account.password, { remember: !!remember });
  this.__signInAttempt = handle;
  const next = await afterLoginForm(this, account);
  if (next === 'login') {
    const messages = await h.pageMessages(this.page);
    throw h.fail(this, `The server refused the login of "${handle}" (${account.username})${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'Check the username and the password of the account in worldParameters.users of cucumber.js.');
  }
  if (next === 'one-time code') {
    throw h.fail(this, `The server asks "${handle}" for a one-time code, and the users registry has no otpSecret for it.`, `Set worldParameters.users.${handle}.otpSecret in cucumber.js to the account's key (the base32 key an authenticator app is given), or use "When I submit the login form as "${handle}"" and type a code.`);
  }
  if (!next) {
    await h.keepSession(this, handle);
    this.__signInUser = handle;
  }
});

/**
 * Fill the login form in with the username and the password of an account of the users registry and send
 * it, nothing more: the browser stays on the page the server shows next (the one-time code, a required
 * action, the consent), for the steps of that page.
 *
 * Example #1: When I submit the login form as "otpuser"
 * Example #2: When I submit the login form as "user"
 * Example #3: When we submit the login form as "otpuser"
 * Example #4: When I submit the login form as "otpuser"
 *               Then I should be asked for a one-time code
 * Example #5: When I submit the login form as "editor"
 */
When(/^(?:I|we) submit the login form as "([^"]*)"$/, async function (handle) {
  const account = h.resolveUser(this, handle);
  if ((await h.loginPage(this)) !== 'login') {
    const where = await startSignIn(this);
    if (where === 'app') throw h.fail(this, 'The server sent the browser straight back to the app: it is signed in already.', 'Start from "Given I am not logged in", or log out first.');
  }
  await sendLoginForm(this, account.username, account.password);
  this.__signInAttempt = handle;
});

/**
 * Fill the login form in with a username (or an email address) and a password, and send it: a login the
 * server must refuse. Nothing is remembered.
 *
 * Example #1: When I log in with the username "user" and the password "Wrong-password-1"
 * Example #2: When I log in with the username "nobody" and the password "Some-password-1"
 * Example #3: When I log in with the username "user@example.com" and the password "Wrong-password-1"
 * Example #4: When I log in with the username "" and the password ""
 * Example #5: When we log in with the username "editor" and the password "Not-the-password-9"
 */
When(/^(?:I|we) log in with the username "([^"]*)" and the password "([^"]*)"$/, async function (login, password) {
  if ((await h.loginPage(this)) !== 'login') {
    const where = await startSignIn(this);
    if (where === 'app') throw h.fail(this, 'The server sent the browser straight back to the app: it is signed in already.', 'Start from "Given I am not logged in", or log out first.');
  }
  await sendLoginForm(this, login, password);
});

/**
 * The login form is on screen again with the server's refusal: the message under the field or over the
 * form ("Invalid username or password.", "Account is disabled, contact your administrator.").
 *
 * Example #1: Then the login should be refused with "Invalid username or password."
 * Example #2: Then the login should be refused with "Invalid username or password"
 * Example #3: Then the login should be refused with "Invalid username or password."
 *               And I should not be logged in
 * Example #4: Then the login should be refused with "username or password"
 * Example #5: Then the login should be refused with "Account is disabled, contact your administrator."
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (expected) {
  await h.eventually(this, async () => ({ page: await h.loginPage(this), messages: await h.pageMessages(this.page) }),
    (r) => r.page === 'login' && r.messages.some((m) => h.mentions(m, expected)),
    async (r) => ({
      message: r.page === 'login' ? `The login form does not show "${expected}". It shows ${h.listed(r.messages)}.` : `The login was not refused: ${await h.pageSummary(this)}.`,
      hint: 'The server shows a refused login on the login form again, with the message under the username field (the default theme) or over the form.',
    }), 5000);
});

/**
 * Log out of the server, as its own logout page does it: the realm's logout address, "Logout" on its
 * question "Do you want to log out?", then "You are logged out". It ends the server's session, so every
 * app that signed in through it is signed out at its next check.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: When I log out
 *               Then I should not be logged in
 * Example #5: When I log out
 *               And I go to the login page
 */
When(/^(?:I|we) log out$/, async function () {
  const who = await h.signedInAs(this);
  if (!who) throw h.fail(this, 'Nobody is signed in at the server, so there is nobody to log out.', 'Sign in first, with "Given I am a logged in user with the "user" user".');
  await h.open(this, h.oidcUrl(this, 'logout'));
  if ((await h.loginPage(this)) === 'logout confirmation') {
    const button = this.page.getByRole('button', { name: 'Logout', exact: true }).or(this.page.locator('#kc-logout')).first();
    await h.navigating(this, () => button.click());
  }
  const after = await h.signedInAs(this);
  if (after) throw h.fail(this, `The server still knows the browser as ${after.username || 'an account'} after the logout: ${await h.pageSummary(this)}.`, 'The logout page asks "Do you want to log out?" and answers "You are logged out".');
  if (who.username) h.dropSession(this, who.username);
  this.__signInUser = null;
});

/**
 * The server knows the browser as a signed-in account (any, or the one of a handle of the users registry).
 * The step asks the server itself, the way a silent sign-in check does, without touching the page.
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should be logged in as "user"
 * Example #3: Then I should be logged in as "otpuser"
 * Example #4: Then we should be logged in as "editor"
 * Example #5: Then I should be logged in as "administrator"
 */
Then(/^(?:I|we) should be logged in(?: as "([^"]*)")?$/, async function (handle) {
  const who = await h.signedInAs(this);
  if (!who) throw h.fail(this, `The server does not know the browser as a signed-in account: ${await h.pageSummary(this)}.`, 'Sign in first, or look at the screenshot of the failure for the server\'s refusal or the page it still asks to fill in.');
  if (handle) {
    const wanted = h.resolveUser(this, handle).username;
    if (!who.username) throw friendly({ message: `The server has a session for the browser, but did not say whose (its account console client did not answer).`, hint: 'The step asks through the realm\'s account console client (account-console); a realm without it cannot tell who is signed in.' });
    if (!h.same(who.username, wanted)) throw friendly({ message: `The browser is signed in as ${who.username}, not as ${wanted} ("${handle}").`, hint: 'An earlier step signed another account in; "Given I am a logged in user with the "…" user" switches accounts.' });
  }
});

/**
 * The browser is a visitor of the server: the server knows no session for it.
 *
 * Example #1: Then I should not be logged in
 * Example #2: Then we should not be logged in
 * Example #3: And I should not be logged in
 * Example #4: But I should not be logged in
 * Example #5: Then I should not be logged in
 *               And I should be on the login page
 */
Then(/^(?:I|we) should not be logged in$/, async function () {
  const who = await h.signedInAs(this);
  if (who) throw friendly({ message: `The browser is still signed in${who.username ? ` as ${who.username}` : ''} at the server.`, hint: 'A logout ends the session ("When I log out"); "Given I am not logged in" makes the browser a visitor.' });
});

/**
 * The page on screen is the server's login form.
 *
 * Example #1: Then I should be on the login page
 * Example #2: Then we should be on the login page
 * Example #3: And I should be on the login page
 * Example #4: But I should be on the login page
 * Example #5: Then I should be on the login page
 *               And I should see "Sign in to your account"
 */
Then(/^(?:I|we) should be on the login page$/, async function () {
  await h.expectLoginPage(this, 'login', 'The login form has the fields "Username or email" and "Password"; the app sends a signed-out browser to it.');
});

/**
 * The browser is back in the app after the server: its address is the app's (not the server's), and the
 * page has finished loading and its requests (the app's exchange of the code for its tokens among them).
 *
 * Example #1: Then I should be back in the app
 * Example #2: Then we should be back in the app
 * Example #3: And I should be back in the app
 * Example #4: Then I should be back in the app
 *               And I should see "Signed in to Webship test app as user."
 * Example #5: Then I should be back in the app
 *               And I should see "Signed in to Webship test app as editor."
 */
Then(/^(?:I|we) should be back in the app$/, async function () {
  const page = this.page;
  const root = h.appRoot(this);
  await h.eventually(this, async () => page.url(), (url) => url.startsWith(root) && !h.onServer(this, url),
    async () => ({ message: `The browser is not back in the app (${root}): ${await h.pageSummary(this)}.`, hint: 'The server sends the browser back to the app once the sign-in is done; a page of the server still on screen asks for something (a one-time code, a required action, the consent).' }));
  await h.appSettled(this);
});

/**
 * Close the browser and open it again: the cookies that live only as long as the browser (the session
 * cookies) go, the ones with an expiry stay, then the app's start page opens. A sign-in with "Remember
 * me" outlives it; one without does not.
 *
 * Example #1: When I close the browser and open it again
 * Example #2: When we close the browser and open it again
 * Example #3: And I close the browser and open it again
 * Example #4: When I close the browser and open it again
 *               Then I should be logged in as "user"
 * Example #5: When I close the browser and open it again
 *               Then I should not be logged in
 */
When(/^(?:I|we) close the browser and open it again$/, async function () {
  const kept = (await this.context.cookies()).filter((c) => c.expires !== -1 && c.expires > Date.now() / 1000);
  await this.context.clearCookies();
  if (kept.length) await this.context.addCookies(kept);
  await h.open(this, h.appUrl(this, h.appSignIn(this).path));
  await h.appSettled(this);
});

/**
 * The server's session of the browser was made with "Remember me" (its session cookie has an expiry, so it
 * outlives the browser), or not (it ends with the browser).
 *
 * Example #1: Then the sign-in should be remembered
 * Example #2: Then the sign-in should not be remembered
 * Example #3: And the sign-in should be remembered
 * Example #4: But the sign-in should not be remembered
 * Example #5: Then the sign-in should be remembered
 *               And I should be logged in as "user"
 */
Then(/^the sign-in should( not)? be remembered$/, async function (not) {
  const cookies = await h.serverCookies(this);
  const identity = cookies.find((c) => c.name === 'KEYCLOAK_IDENTITY' || c.name === 'KEYCLOAK_IDENTITY_LEGACY');
  if (!identity) throw h.fail(this, `The browser has no session at the server (no session cookie of the realm; it has ${h.listed(cookies.map((c) => c.name))}).`, 'Sign in first.');
  const persistent = identity.expires !== -1;
  if (!not && !persistent) throw friendly({ message: 'The sign-in is not remembered: the server\'s session cookie ends with the browser.', hint: 'Tick "Remember me" on the login form ("… with the login form and "Remember me" checked"); the realm offers it when its setting "Remember me" is on.' });
  if (not && persistent) throw friendly({ message: `The sign-in is remembered: the server's session cookie lives until ${new Date(identity.expires * 1000).toISOString()}.`, hint: 'A login without "Remember me" makes a cookie that ends with the browser.' });
});

/**
 * Press "Restart login" on a page of the login flow (the one-time code, a required action): the server
 * forgets the username typed and shows the empty login form.
 *
 * Example #1: When I restart the login
 * Example #2: When we restart the login
 * Example #3: And I restart the login
 * Example #4: When I restart the login
 *               Then I should be on the login page
 * Example #5: When I restart the login
 *               And I log in as "user" with the login form
 */
When(/^(?:I|we) restart the login$/, async function () {
  const button = this.page.getByRole('button', { name: 'Restart login', exact: true }).or(this.page.locator('#reset-login')).first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `The page has no "Restart login" button: ${await h.pageSummary(this)}.`, 'The server shows it on the pages after the password (the one-time code, a required action).');
  await h.navigating(this, () => button.click());
});

module.exports = { startSignIn, signIn, sendLoginForm, afterLoginForm };
