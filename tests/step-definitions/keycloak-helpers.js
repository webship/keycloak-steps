'use strict';

// Shared plumbing of the sign-in steps: the addresses (the app and the sign-in server), waiting for the
// server's pages and consoles, the fields and messages of the server's login pages, the one-time codes
// (worked out from an account's secret the way an authenticator app does), the users registry and the
// session cache, the server's admin REST API (as the data administrator), the clean-up after a scenario,
// and the mailbox of the mail catcher.
//
// This file registers no step. The server's login pages are rendered by the server: every action is a
// form POST and a full page load, and the next page tells what the server wants (a one-time code, a
// required action, the consent). Its account console and its admin console are single-page apps: they
// sign in silently, then ask the server's REST API for each page behind a spinner. The steps wait for
// those signals: the page load, the spinner gone, the REST requests of the page answered. Never a fixed
// time, but for one thing an authenticator app waits for too: a one-time code is valid for one 30-second
// window, so a second code in the same window waits for the next one.

const crypto = require('crypto');
const { friendly, smartSettle } = require('webship-js/tests/step-definitions/webship');
const { request: playwrightRequest } = require('playwright');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/** White space collapsed and trimmed; the invisible marks some texts carry removed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[­​-‏‪-‮⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** A text as a comparison sees it: cleaned, in lower case, typographic quotes straight, a closing colon or asterisk dropped. */
function normal(text) {
  return clean(text).replace(/[“”„"]/g, '"').replace(/[‘’‚']/g, "'").replace(/(?:\s*[:*…]+|\.\.\.)$/, '').toLowerCase();
}

/** Whether a text contains another, as `normal` reads them. */
function mentions(text, part) {
  return normal(text).includes(normal(part));
}

/** Whether two texts are the same, as `normal` reads them. */
function same(a, b) {
  return normal(a) === normal(b);
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values, max = 12) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  if (!items.length) return '(none)';
  const shown = items.slice(0, max).map((item) => `"${item}"`).join(', ');
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/** A password no person would choose, that every common password rule accepts. */
function newPassword() {
  return `Webship-${crypto.randomBytes(6).toString('hex')}-Aa1`;
}

// ---------------------------------------------------------------------------
// Addresses: the app (launchUrl) and the sign-in server (signInServer)
// ---------------------------------------------------------------------------

/** The app's root without a trailing slash. */
function appRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** An address of the app from a path (absolute addresses stay as they are). */
function appUrl(world, href = '/') {
  if (/^https?:\/\//.test(href)) return href;
  return appRoot(world) + (String(href).startsWith('/') ? '' : '/') + href;
}

/** The sign-in server of cucumber.js: { url, realm }, the address with its path and without a trailing slash. */
function server(world) {
  const config = (world.parameters && world.parameters.signInServer) || {};
  if (!config.url || !config.realm) {
    throw friendly({
      message: 'cucumber.js names no sign-in server.',
      hint: "Set worldParameters.signInServer in cucumber.js: { url: 'https://sso.example.org', realm: 'my-realm' } (the url with its path, such as https://example.org/auth when the server runs under /auth).",
    });
  }
  return { url: String(config.url).replace(/\/+$/, ''), realm: String(config.realm) };
}

/** The address of the realm: <server>/realms/<realm>. */
function realmUrl(world) {
  const { url, realm } = server(world);
  return `${url}/realms/${encodeURIComponent(realm)}`;
}

/** The address of the realm's OpenID Connect endpoint `name` (auth, token, logout). */
function oidcUrl(world, name) {
  return `${realmUrl(world)}/protocol/openid-connect/${name}`;
}

/** The address of the realm's account console. */
function accountConsoleUrl(world) {
  return `${realmUrl(world)}/account/`;
}

/** The address of the realm's admin console. */
function adminConsoleUrl(world) {
  const { url, realm } = server(world);
  return `${url}/admin/${encodeURIComponent(realm)}/console/`;
}

/** Whether an address is one of the sign-in server's (its origin and its path). */
function onServer(world, href) {
  const base = server(world).url;
  return String(href || '').startsWith(base + '/') || String(href || '') === base;
}

/** How the app starts a sign-in: the page of the app, and the button or link it shows there ('' for none). */
function appSignIn(world) {
  const config = (world.parameters && world.parameters.appSignIn) || {};
  return { path: config.path === undefined ? '/' : String(config.path), button: config.button === undefined ? 'Sign in' : String(config.button) };
}

/** The path and query of the page on screen. */
function currentPath(world) {
  try {
    const url = new URL(world.page.url());
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The request the browser cut
// ---------------------------------------------------------------------------

/** The hint of a failure where the browser cut a request. */
const CUT_HINT = 'The request was cut, or the site\'s name did not resolve, because the network of the machine changed (a container starting); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

const NETWORK_ERRORS = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/;

/** A sentence when the browser cut a request of the page since `since`, else ''. */
function cutRequest(world, since = 0) {
  const url = String((world.page && world.page.url()) || '');
  if (url.startsWith('chrome-error://')) return `the browser shows its own error page (${url}): the request was cut before the site answered`;
  const failed = (world.__signInFailedRequests || []).filter((f) => f.at >= since && NETWORK_ERRORS.test(f.error));
  if (failed.length) {
    const f = failed[failed.length - 1];
    return `the browser lost the request ${f.method} ${f.url} (${f.error}): it was cut before the site answered`;
  }
  return '';
}

/** A friendly failure, with the cut request named when there was one. */
function fail(world, message, hint, since = 0) {
  const cut = cutRequest(world, since);
  if (cut && !/cut before the site answered/.test(message)) return friendly({ message: `${message} In this scenario ${cut}.`, hint: CUT_HINT });
  return friendly({ message, hint });
}

// ---------------------------------------------------------------------------
// The page: instrumentation and waiting
// ---------------------------------------------------------------------------

/**
 * Runs in every document before the page's own scripts. webship-js counts the pending timers of a page to
 * know when it settled; the server's consoles keep timers that fire many seconds later (the 5-second check
 * of the login state, the renewal of the token): a timer of five seconds or more is no work the page is
 * doing now, so it is taken out of the count, which stays right whichever init script runs first.
 */
function quietLongTimers() {
  if (window.__webshipSignInQuiet) return;
  window.__webshipSignInQuiet = true;
  const counted = () => typeof window.__webshipPendingTimers === 'number';
  if (typeof window.setTimeout !== 'function') return;
  const previousSet = window.setTimeout;
  const previousClear = window.clearTimeout;
  const long = new Set();
  window.setTimeout = function (callback, delay, ...args) {
    if (!(Number(delay) >= 5000) || !counted()) return previousSet.call(this, callback, delay, ...args);
    let id;
    const fire = function () {
      if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
      return typeof callback === 'function' ? callback.apply(this, args) : undefined;
    };
    id = previousSet.call(this, fire, delay);
    long.add(id);
    window.__webshipPendingTimers -= 1;
    return id;
  };
  window.clearTimeout = function (id) {
    if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
    return previousClear.call(this, id);
  };
}

const TRACKED = new WeakMap();

/** The background requests (XHR and fetch) of a page that are still running; a navigation drops those of the page it leaves. */
function requests(page) {
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Set() };
    TRACKED.set(page, state);
    page.on('request', (r) => { if (['xhr', 'fetch'].includes(r.resourceType())) state.pending.add(r); });
    const done = (r) => { state.pending.delete(r); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) state.pending.clear(); });
  }
  return state;
}

/** Set up a page the World opened: the long timers, the requests in flight, the requests the browser cut. */
async function instrument(world, page) {
  await page.addInitScript(quietLongTimers).catch(() => {});
  requests(page);
  world.__signInFailedRequests = world.__signInFailedRequests || [];
  page.on('requestfailed', (r) => {
    const failure = r.failure();
    world.__signInFailedRequests.push({ at: Date.now(), method: r.method(), url: r.url(), error: (failure && failure.errorText) || '' });
  });
}

/** What the page still has to do, as it says itself: '' when nothing. */
async function pageWork(world) {
  try {
    return await world.page.evaluate(() => {
      if (document.readyState === 'loading') return 'the document is still loading';
      const spinner = [...document.querySelectorAll('.pf-v5-c-spinner, .pf-c-spinner, [role="progressbar"]')].find((s) => s.getClientRects().length);
      if (spinner) return 'the page shows a spinner';
      return '';
    });
  } catch (err) {
    return /Execution context was destroyed|navigation|Target closed|has been closed/i.test(String(err && err.message)) ? 'a new page is loading' : '';
  }
}

/**
 * Wait until the page is ready to use: its document loaded, no spinner, no background request running, and
 * all of it so for a short moment (200 ms). Returns '' when it is, else what the page was still doing when
 * the time ran out; `strict` makes that a failure.
 */
async function ready(world, { timeout, strict = false } = {}) {
  const page = world.page;
  const limit = timeout || budget(world);
  const deadline = Date.now() + limit;
  const state = requests(page);
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  let busy = '';
  let quietSince = 0;
  for (;;) {
    busy = await pageWork(world);
    if (!busy && state.pending.size) {
      busy = `requests in flight: ${[...state.pending].slice(0, 3).map((r) => `${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`).join(', ')}`;
    }
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 200) return '';
    } else {
      quietSince = 0;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(50);
  }
  if (strict) {
    throw fail(world, `The page did not finish its work within ${Math.round(limit / 1000)} seconds (${page.url()}): ${busy}.`, 'The consoles show a spinner while they ask the server for a page, and every request answers within a moment; look at the screenshot of the failure and the browser console.');
  }
  return busy;
}

/** Open an address and wait until the page is ready. A cut request is tried again once. */
async function open(world, url) {
  const page = world.page;
  const go = () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: budget(world) * 2 });
  try {
    await go();
  } catch (err) {
    if (NETWORK_ERRORS.test(String(err && err.message)) || /chrome-error:\/\/chromewebdata|ERR_ABORTED/.test(String(err && err.message))) {
      await page.waitForTimeout(500);
      await go().catch(() => {});
    } else {
      throw friendly({ message: `Could not open ${url}.`, cause: err, hint: 'Check launchUrl and signInServer in cucumber.js, and that the site is running (ddev describe).' });
    }
  }
  if (cutRequest(world)) {
    await page.waitForTimeout(500);
    await go().catch(() => {});
  }
  await ready(world);
}

/**
 * Wait until a page of the app has done its own work: webship-js's settle (no request, no timer, no change of
 * the page for a moment), then the page ready as above. An app decides whether the browser is signed in in a
 * hidden frame (a silent sign-in check) before it shows its sign-in button or the account: the frame's loads
 * are network the settle waits for.
 */
async function appSettled(world) {
  await smartSettle(world.page, Math.min(budget(world), 10000)).catch(() => {});
  await ready(world);
}

/**
 * Run an action that sends the page to a new address (a form POST of the login pages, a link) and wait for
 * the new page: the main frame navigates, then the page is ready. The server answers a form with the next
 * page or with a redirect to the app, so the step reads where the browser landed afterwards.
 */
async function navigating(world, action, { timeout } = {}) {
  const page = world.page;
  const limit = timeout || budget(world) * 2;
  const since = Date.now();
  const before = page.url();
  const navigated = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: limit }).then(() => true).catch(() => false);
  await action();
  if (!(await navigated)) {
    throw fail(world, `The page did not change within ${Math.round(limit / 1000)} seconds after the action (still at ${before}).`, 'A form of the sign-in server answers with the next page: look at the screenshot of the failure for a message that stopped it.', since);
  }
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  // A form sent again could act twice: a cut request fails the step at once, and says so.
  const cut = cutRequest(world, since);
  if (cut) throw friendly({ message: `The page after the action did not come: ${cut}.`, hint: CUT_HINT });
  await ready(world);
}

/** Poll a reading until it satisfies a check, or fail with the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) {
      const e = await explain(value);
      throw fail(world, e.message, e.hint);
    }
    await world.page.waitForTimeout(150);
  }
}

/** The main heading of the page, as a person reads it. */
async function heading(page) {
  return clean(await page.locator('main h1:visible, h1#kc-page-title:visible, h1:visible').first().innerText({ timeout: 1500 }).catch(() => ''));
}

/** What the page on screen says about itself, for an error message. */
async function pageSummary(world) {
  const cut = cutRequest(world);
  if (cut) return cut;
  const page = world.page;
  return `the page shows "${(await heading(page)) || '(no heading)'}" at ${page.url()}`;
}

// ---------------------------------------------------------------------------
// The server's login pages: the page, its fields and its messages
// ---------------------------------------------------------------------------

// The pages of the login flow, by what they show. The login themes keep the ids of their forms: the steps
// read them as a fallback of what a person reads (the heading and the labels).
const LOGIN_PAGES = {
  // The most specific pages first: the registration form has the login form's fields and more.
  registration: '#kc-register-form, form:has(#password-confirm):has(#email)',
  'update password': 'form:has(#password-new):has(#password-confirm)',
  'set up a one-time code': '#kc-totp-settings-form, form:has(input#totp):has(#totpSecret)',
  'one-time code': '#kc-otp-login-form, form:has(input#otp)',
  consent: '#kc-oauth, form:has(button[name="accept"]):has(button[name="cancel"])',
  'delete a credential': 'form:has(#kc-accept):has(#kc-decline)',
  'verify email': '#kc-page-title:text-matches("verif", "i")',
  'logout confirmation': '#kc-logout-confirm, input#kc-logout, button#kc-logout',
  error: '#kc-error-message',
  login: '#kc-form-login, form:has(#username):has(#password):not(:has(#password-confirm))',
  'forgot password': '#kc-reset-password-form, form:has(#username):not(:has(#password))',
}

/** Which page of the login flow is on screen ('' for none: the browser is not on the server's pages). */
async function loginPage(world) {
  const page = world.page;
  if (!onServer(world, page.url())) return '';
  for (const [name, selector] of Object.entries(LOGIN_PAGES)) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return name;
  }
  if (await page.locator('h1#kc-page-title').isVisible().catch(() => false)) return 'info';
  return 'other';
}

/** Wait for a page of the login flow, or fail with what is on screen. */
async function expectLoginPage(world, name, hint) {
  const page = world.page;
  const deadline = Date.now() + budget(world);
  let found = '';
  for (;;) {
    found = await loginPage(world);
    if (found === name) return;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  throw fail(world, `The sign-in server does not show its ${name} page: ${found ? `it shows its ${found} page, ` : ''}${await pageSummary(world)}.`, hint);
}

// The ids of fields whose label does not name them (the "Mobile Authenticator Setup" page of the default
// login theme labels both of its fields for an element that does not exist), by the label a person reads.
const FIELD_IDS = {
  'one-time code': ['otp', 'totp'],
  'device name': ['userLabel'],
  'username or email': ['username'],
  username: ['username'],
  password: ['password', 'password-new'],
  'new password': ['password-new'],
  'confirm password': ['password-confirm'],
  email: ['email'],
  'first name': ['firstName'],
  'last name': ['lastName'],
};

/**
 * A field of the page by the label a person reads: the field the label names (exact, then a label that
 * reads the same once its "*" is dropped), the field in the same form group as the label, then the
 * page's own id for that label. Returns a locator, or null.
 */
async function field(page, label) {
  const byLabel = page.getByLabel(label, { exact: true });
  if (await byLabel.first().isVisible().catch(() => false)) return byLabel.first();
  const id = await page.evaluate((wanted) => {
    const norm = (t) => String(t || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim().toLowerCase();
    for (const l of document.querySelectorAll('label')) {
      if (norm(l.textContent) !== norm(wanted)) continue;
      const target = l.getAttribute('for') && document.getElementById(l.getAttribute('for'));
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return target.id;
      const group = l.closest('.pf-v5-c-form__group, .pf-c-form__group, .form-group, div');
      const input = group && group.querySelector('input:not([type=hidden]), select, textarea');
      if (input && input.id) return input.id;
    }
    return '';
  }, label).catch(() => '');
  if (id) return page.locator(`[id="${id}"]`);
  for (const fallback of FIELD_IDS[normal(label)] || []) {
    const loc = page.locator(`[id="${fallback}"]:visible`);
    if (await loc.count().catch(() => 0)) return loc.first();
  }
  return null;
}

/** A field of the page by its label, or fail with the labels the page has. */
async function needField(world, label) {
  const loc = await field(world.page, label);
  if (loc) return loc;
  const labels = await world.page.locator('label:visible').allInnerTexts().catch(() => []);
  throw fail(world, `The page has no field "${label}". Its fields are labelled ${listed(labels.map((l) => l.replace(/\s*\*\s*$/, '')))}: ${await pageSummary(world)}.`, 'Use the label a person reads over the field.');
}

/** The error the page shows for a field: the message of the login themes under it (#input-error-<id>), or its group's error text. */
async function fieldError(page, locator) {
  return page.evaluate((input) => {
    const texts = [];
    const own = input.id && document.getElementById(`input-error-${input.id}`);
    if (own) texts.push(own.textContent);
    // The older "keycloak" theme puts the login form's error in #input-error, under the username.
    const login = (input.id === 'username' || input.id === 'password') && document.getElementById('input-error');
    if (login) texts.push(login.textContent);
    if (input.id === 'totp' || input.id === 'otp') {
      for (const id of ['input-error-otp-code', 'input-error-otp']) {
        const e = document.getElementById(id);
        if (e) texts.push(e.textContent);
      }
    }
    const group = input.closest('.pf-v5-c-form__group, .pf-c-form__group, .form-group');
    if (group) for (const e of group.querySelectorAll('.pf-m-error, .kc-feedback-text, [id^="input-error"]')) texts.push(e.textContent);
    return [...new Set(texts.map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' ');
  }, await locator.elementHandle()).catch(() => '');
}

/** The messages of the login page: the alerts over the form and the errors under the fields. */
async function pageMessages(page) {
  return page.evaluate(() => {
    const texts = [];
    // The default theme's errors are #input-error-<field>; the older "keycloak" theme's login error is #input-error.
    for (const e of document.querySelectorAll('.pf-v5-c-alert__title, .pf-c-alert__title, .alert, #kc-error-message .instruction, [id^="input-error"]:not([id^="input-error-container"])')) {
      if (e.getClientRects().length) texts.push(e.textContent);
    }
    return [...new Set(texts.map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  }).catch(() => []);
}

/** The text of the alerts (or the given kind of alert) the page shows: the login pages' and the consoles' toasts. */
async function alerts(page, kind) {
  return page.evaluate((k) => {
    const out = [];
    for (const a of document.querySelectorAll('.pf-v5-c-alert, .pf-c-alert, .alert')) {
      if (!a.getClientRects().length) continue;
      const cls = a.className;
      const type = /success/.test(cls) ? 'success' : /danger|error/.test(cls) ? 'error' : /warning/.test(cls) ? 'warning' : 'info';
      if (k && k !== type) continue;
      const title = a.querySelector('.pf-v5-c-alert__title, .pf-c-alert__title, .kc-feedback-text');
      out.push(String((title || a).textContent || '').replace(/^(Success|Danger|Warning|Info|Default) alert:\s*/i, '').replace(/\s+/g, ' ').trim());
    }
    return out.filter(Boolean);
  }, kind || '').catch(() => []);
}

/** Press the submit button of the login page (by its words, then the theme's id) and wait for the next page. */
async function submitLogin(world, words = ['Sign In', 'Log In', 'Submit', 'Continue']) {
  const page = world.page;
  let button = null;
  for (const name of words) {
    const b = page.getByRole('button', { name, exact: true });
    if (await b.first().isVisible().catch(() => false)) { button = b.first(); break; }
  }
  if (!button) button = page.locator('#kc-login:visible, #kc-submit:visible, #saveTOTPBtn:visible, input[type=submit]:visible, button[type=submit]:visible').first();
  await navigating(world, () => button.click());
}

// ---------------------------------------------------------------------------
// One-time codes (RFC 6238), the way an authenticator app works them out
// ---------------------------------------------------------------------------

/** The bytes of a base32 key (spaces, dashes and padding allowed). */
function base32Bytes(key) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const text = String(key || '').toUpperCase().replace(/[\s=-]+/g, '');
  if (!text || /[^A-Z2-7]/.test(text)) throw new Error(`"${key}" is not a base32 key`);
  let bits = '';
  for (const c of text) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code of a key for a time step: HMAC of the step counter, dynamic truncation, `digits` digits. */
function totp(key, step, { digits = 6, algorithm = 'sha1' } = {}) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac(algorithm, base32Bytes(key)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % (10 ** digits)).padStart(digits, '0');
}

// The time steps whose code this run used, by key: the server takes a code once, so a second sign-in in the
// same window waits for the next one, as a person with an authenticator app does.
const USED_STEPS = new Map();

/**
 * A fresh code of a key: the current window's, or the next window's once this run used the current one
 * (waiting for that window to start). `period` in seconds.
 */
async function freshCode(world, key, { period = 30, digits = 6, algorithm = 'sha1' } = {}) {
  const id = base32Bytes(key).toString('hex');
  for (;;) {
    const step = Math.floor(Date.now() / 1000 / period);
    if (!(USED_STEPS.get(id) >= step)) {
      USED_STEPS.set(id, step);
      return totp(key, step, { digits, algorithm });
    }
    const wait = (step + 1) * period * 1000 - Date.now() + 100;
    await world.page.waitForTimeout(Math.max(wait, 50));
  }
}

/** Note that a code of a key was used now (a code a step typed, or one the page set up). */
function codeUsed(key, period = 30) {
  try {
    USED_STEPS.set(base32Bytes(key).toString('hex'), Math.floor(Date.now() / 1000 / period));
  } catch { /* not a key */ }
}

// ---------------------------------------------------------------------------
// The users registry and the sessions
// ---------------------------------------------------------------------------

/**
 * The account a handle of the users registry stands for: { handle, username, email, password, otpSecret }.
 * A password this scenario gave the account (a reset, a required action) wins over the registry's.
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}', email: '${handle}@example.com', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  if (!entry.password) {
    throw friendly({ message: `The user "${handle}" has no password in the users registry.`, hint: `Set worldParameters.users.${handle}.password in cucumber.js.` });
  }
  const changed = (world.__signInPasswords || {})[handle];
  const otpSecret = ((world.__signInOtpKeys || {})[handle]) || entry.otpSecret || '';
  return { handle, username: entry.username || handle, email: entry.email || '', password: changed || entry.password, configuredPassword: entry.password, otpSecret };
}

/** The handle of the registry an address or a username stands for, or ''. */
function handleOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  if (users[who]) return who;
  for (const [handle, entry] of Object.entries(users)) {
    if (same(entry.username || handle, who) || (entry.email && same(entry.email, who))) return handle;
  }
  return '';
}

/** The email address of a handle of the registry; anything else is an address already. */
function addressOf(world, who) {
  const handle = handleOf(world, who);
  if (handle) {
    const account = resolveUser(world, handle);
    if (!account.email) throw friendly({ message: `The user "${handle}" has no email in the users registry.`, hint: `Set worldParameters.users.${handle}.email in cucumber.js.` });
    return account.email;
  }
  return String(who);
}

// The sessions of the accounts that signed in during this run, by server, realm and username: the server's
// cookies after a sign-in.
const SESSIONS = new Map();

function sessionKey(world, username) {
  const { url, realm } = server(world);
  return `${url}|${realm}|${String(username).toLowerCase()}`;
}

/** Whether an account that signed in keeps its session for the rest of the run (`reuseSessions`, on by default). */
function reusesSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** The cookies of the sign-in server's realm in the browser's context. */
async function serverCookies(world) {
  const realmPath = new URL(realmUrl(world)).pathname;
  const host = new URL(server(world).url).hostname;
  return (await world.context.cookies()).filter((c) => c.domain.replace(/^\./, '') === host && realmPath.startsWith(c.path.replace(/\/$/, '')));
}

/** Remember the browser's session at the server for an account. */
async function keepSession(world, handle) {
  if (!reusesSessions(world) || !handle) return;
  const account = resolveUser(world, handle);
  SESSIONS.set(sessionKey(world, account.username), await serverCookies(world));
}

/** Forget the kept session of an account (it logged out, or its password changed). */
function dropSession(world, username) {
  SESSIONS.delete(sessionKey(world, username));
}

/** Forget every kept session (a step ended the sessions of every device). */
function dropAllSessions() {
  SESSIONS.clear();
}

/**
 * Drop every cookie of the browser: the browser is a visitor of the app and of the server; the sessions on
 * the server live on. The page on screen is left too: an app keeps who is signed in in the page itself, so a
 * page opened before would still show the account of its cookies.
 */
async function forgetBrowser(world) {
  await world.context.clearCookies();
  await world.page.goto('about:blank').catch(() => {});
  world.__signInUser = null;
}

/** A PKCE pair: the verifier and its S256 challenge. */
function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

/** The claims of a JWT, unverified (the token comes straight from the server over TLS). */
function claims(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * The account the server says the browser is signed in as, without touching the page: the authorization
 * request a silent sign-in check sends (prompt=none) for the realm's account console, with the browser's
 * own cookies, then the code exchanged for its ID token. Returns { username, sub } or null for a visitor.
 * A realm whose account console is switched off answers "unknown": the cookie of the server's session is
 * the answer then.
 */
async function signedInAs(world) {
  const client = 'account-console';
  const redirect = accountConsoleUrl(world);
  const { verifier, challenge } = pkce();
  const params = new URLSearchParams({ client_id: client, redirect_uri: redirect, response_type: 'code', scope: 'openid', prompt: 'none', state: crypto.randomUUID(), nonce: crypto.randomUUID(), code_challenge: challenge, code_challenge_method: 'S256' });
  const req = world.context.request;
  const res = await req.get(`${oidcUrl(world, 'auth')}?${params}`, { maxRedirects: 0, failOnStatusCode: false });
  const location = res.headers().location || '';
  if (res.status() >= 300 && res.status() < 400 && location) {
    const back = new URL(location, redirect);
    const answer = new URLSearchParams(back.search || back.hash.replace(/^#/, ''));
    if (answer.get('error')) return null;
    const code = answer.get('code');
    if (!code) return null;
    const token = await req.post(oidcUrl(world, 'token'), { form: { grant_type: 'authorization_code', code, client_id: client, redirect_uri: redirect, code_verifier: verifier }, failOnStatusCode: false });
    const json = await token.json().catch(() => ({}));
    if (!json.id_token) return null;
    const c = claims(json.id_token);
    return { username: c.preferred_username || '', sub: c.sub || '' };
  }
  const identity = (await serverCookies(world)).find((c) => c.name === 'KEYCLOAK_IDENTITY' || c.name === 'KEYCLOAK_IDENTITY_LEGACY');
  return identity ? { username: '', sub: claims(identity.value).sub || '' } : null;
}

// ---------------------------------------------------------------------------
// The server's admin REST API, as the data administrator
// ---------------------------------------------------------------------------

const ADMINS = new Map();

/**
 * A client of the realm's admin REST API, signed in as the data administrator (`worldParameters.dataAdmin`,
 * a handle of the registry with the realm's admin rights) through the realm's admin-cli client, in a
 * session of its own: the browser's session is never touched. `call(method, path, body)` returns
 * { status, json } for a path under /admin/realms/<realm>.
 */
async function admin(world) {
  const handle = (world.parameters && world.parameters.dataAdmin) || '';
  if (!handle) {
    throw friendly({
      message: 'This step changes an account through the server\'s admin REST API, and cucumber.js names no data administrator.',
      hint: "Set worldParameters.dataAdmin in cucumber.js to a handle of the users registry that is an admin of the realm (realm-management: realm-admin), such as 'administrator'. The step gives the account back its state after the scenario through the same API.",
    });
  }
  const account = resolveUser(world, handle);
  const key = `${sessionKey(world, account.username)}|admin`;
  if (ADMINS.has(key)) return ADMINS.get(key);
  const ctx = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  let token = '';
  let expires = 0;
  const signIn = async () => {
    const res = await ctx.post(oidcUrl(world, 'token'), { form: { grant_type: 'password', client_id: 'admin-cli', username: account.username, password: account.configuredPassword }, failOnStatusCode: false });
    const json = await res.json().catch(() => ({}));
    if (!json.access_token) {
      throw friendly({
        message: `The data administrator "${handle}" could not sign in to the admin REST API: ${json.error_description || json.error || `status ${res.status()}`}.`,
        hint: 'The account signs in through the realm\'s admin-cli client (direct access grants on, the default) with the password of the users registry; it must not need a one-time code. The build of the site makes it.',
      });
    }
    token = json.access_token;
    expires = Date.now() + Math.max(10, (json.expires_in || 60) - 10) * 1000;
  };
  const base = `${server(world).url}/admin/realms/${encodeURIComponent(server(world).realm)}`;
  const client = {
    handle,
    async call(method, path, body) {
      if (!token || Date.now() > expires) await signIn();
      const options = { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, failOnStatusCode: false };
      if (body !== undefined) options.data = body;
      const res = await ctx.fetch(base + path, options);
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status(), json };
    },
  };
  ADMINS.set(key, client);
  return client;
}

/** The server's account of a handle of the registry (its representation), through the admin REST API. */
async function adminUser(world, handle) {
  const api = await admin(world);
  const account = resolveUser(world, handle);
  const res = await api.call('GET', `/users?username=${encodeURIComponent(account.username)}&exact=true`);
  const user = Array.isArray(res.json) && res.json.find((u) => same(u.username, account.username));
  if (!user) throw friendly({ message: `The realm has no account "${account.username}" (the user "${handle}" of the registry).`, hint: 'The build of the site makes the accounts of the users registry; build again or add them (ACCOUNTS_ONLY=1 of the build script).' });
  return { api, account, user };
}

// ---------------------------------------------------------------------------
// The clean-up after a scenario
// ---------------------------------------------------------------------------

/** Whether the steps put back after a scenario what it changed (`signInCleanUp`, on by default). */
function cleansUp(world) {
  return !(world.parameters && world.parameters.signInCleanUp === false);
}

/** Register a clean-up for after the scenario, once per key; the newest runs first. */
function afterScenario(world, key, fn) {
  world.__signInCleanups = world.__signInCleanups || [];
  if (world.__signInCleanups.some((c) => c.key === key)) return;
  world.__signInCleanups.push({ key, fn });
}

/** Run the clean-ups of the scenario. A failed one is reported, the others still run. */
async function runCleanups(world) {
  const list = (world.__signInCleanups || []).slice().reverse();
  world.__signInCleanups = [];
  const problems = [];
  for (const { key, fn } of list) {
    try { await fn(); } catch (err) { problems.push(`${key}: ${(err && err.message) || err}`); }
  }
  return problems;
}

/**
 * Put an account back as the registry has it after the scenario: its password, no required action, its
 * email verified, the one-time codes the scenario set up deleted (its own kept), its names and email.
 * Registered once per account, before the scenario changes it: what the server says then is what comes back.
 */
async function restoreAccountAfter(world, handle) {
  if (!cleansUp(world)) return;
  world.__signInRestore = world.__signInRestore || {};
  if (world.__signInRestore[handle]) return;
  const { api, account, user } = await adminUser(world, handle);
  const credentials = await api.call('GET', `/users/${user.id}/credentials`);
  const kept = new Set((Array.isArray(credentials.json) ? credentials.json : []).map((c) => c.id));
  world.__signInKept = world.__signInKept || {};
  world.__signInKept[handle] = kept;
  const consents = await api.call('GET', `/users/${user.id}/consents`);
  const granted = new Set((Array.isArray(consents.json) ? consents.json : []).map((c) => c.clientId));
  world.__signInRestore[handle] = true;
  afterScenario(world, `account:${handle}`, async () => {
    const res = await api.call('PUT', `/users/${user.id}`, { email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: user.emailVerified, enabled: user.enabled, requiredActions: user.requiredActions || [] });
    if (res.status >= 400) throw new Error(`PUT /users/${user.id} answered ${res.status}`);
    const now = await api.call('GET', `/users/${user.id}/credentials`);
    for (const c of Array.isArray(now.json) ? now.json : []) {
      if (!kept.has(c.id) && c.type !== 'password') await api.call('DELETE', `/users/${user.id}/credentials/${c.id}`);
    }
    const pw = await api.call('PUT', `/users/${user.id}/reset-password`, { type: 'password', value: account.configuredPassword, temporary: false });
    if (pw.status >= 400) throw new Error(`PUT /users/${user.id}/reset-password answered ${pw.status}`);
    const after = await api.call('GET', `/users/${user.id}/consents`);
    for (const c of Array.isArray(after.json) ? after.json : []) {
      if (!granted.has(c.clientId)) await api.call('DELETE', `/users/${user.id}/consents/${encodeURIComponent(c.clientId)}`);
    }
    dropSession(world, account.username);
  });
}

/** Whether a credential of an account was there before the scenario changed the account (null: not known). */
function keptCredential(world, handle, id) {
  const kept = (world.__signInKept || {})[handle];
  return kept ? kept.has(id) : null;
}

/** Note that the scenario gave an account a password: later steps of the scenario use it; the clean-up gives back the registry's. */
function passwordChanged(world, handle, password) {
  world.__signInPasswords = world.__signInPasswords || {};
  world.__signInPasswords[handle] = password;
  dropSession(world, resolveUser(world, handle).username);
}

/** Note the key of a one-time code the scenario set up for an account: later steps of the scenario work its codes out from it. */
function otpKeyChanged(world, handle, key) {
  world.__signInOtpKeys = world.__signInOtpKeys || {};
  world.__signInOtpKeys[handle] = key;
}

// ---------------------------------------------------------------------------
// The mailbox: the mail catcher of the site (Mailpit)
// ---------------------------------------------------------------------------

/** The address of the mail catcher (`worldParameters.mailUrl`), without a trailing slash. */
function mailUrl(world) {
  const url = world.parameters && world.parameters.mailUrl;
  if (!url) throw friendly({ message: 'No mailbox is configured.', hint: 'Set worldParameters.mailUrl in cucumber.js to the mail catcher (Mailpit) the server sends its mail to, for example https://your-project.ddev.site:8026.' });
  return String(url).replace(/\/+$/, '');
}

let MAIL_CONTEXT = null;

async function mailContext() {
  if (!MAIL_CONTEXT) MAIL_CONTEXT = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  return MAIL_CONTEXT;
}

/** The messages of the mailbox to an address, newest first, as Mailpit lists them: [{ ID, Subject, Created, To }]. */
async function mailTo(world, address) {
  const ctx = await mailContext();
  const res = await ctx.get(`${mailUrl(world)}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=50`, { failOnStatusCode: false });
  if (res.status() !== 200) throw friendly({ message: `The mail catcher at ${mailUrl(world)} answered ${res.status()}.`, hint: 'Check worldParameters.mailUrl in cucumber.js and that the mail catcher runs (ddev describe lists it).' });
  const json = await res.json();
  return (json.messages || []).filter((m) => (m.To || []).some((t) => same(t.Address, address)));
}

/** One message of the mailbox, whole: { Subject, Text, HTML, To, From }. */
async function mailMessage(world, id) {
  const ctx = await mailContext();
  return (await ctx.get(`${mailUrl(world)}/api/v1/message/${id}`)).json();
}

/** The links of a message: [{ text, href }], from its HTML (the text of the link) or its plain text. */
function mailLinks(message) {
  const links = [];
  for (const m of String(message.HTML || '').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ text: clean(m[2].replace(/<[^>]+>/g, ' ')), href: m[1].replace(/&amp;/g, '&') });
  }
  if (!links.length) for (const m of String(message.Text || '').matchAll(/https?:\/\/\S+/g)) links.push({ text: m[0], href: m[0] });
  return links;
}

module.exports = {
  CUT_HINT,
  accountConsoleUrl,
  addressOf,
  admin,
  adminConsoleUrl,
  adminUser,
  afterScenario,
  alerts,
  appRoot,
  appSettled,
  appSignIn,
  appUrl,
  budget,
  claims,
  clean,
  cleansUp,
  codeUsed,
  currentPath,
  cutRequest,
  dropAllSessions,
  dropSession,
  eventually,
  expectLoginPage,
  fail,
  field,
  fieldError,
  forgetBrowser,
  freshCode,
  handleOf,
  heading,
  instrument,
  keepSession,
  keptCredential,
  listed,
  loginPage,
  mailLinks,
  mailMessage,
  mailTo,
  mailUrl,
  mentions,
  navigating,
  needField,
  newPassword,
  normal,
  oidcUrl,
  onServer,
  open,
  otpKeyChanged,
  pageMessages,
  pageSummary,
  passwordChanged,
  ready,
  realmUrl,
  resolveUser,
  restoreAccountAfter,
  reusesSessions,
  runCleanups,
  same,
  server,
  serverCookies,
  SESSIONS,
  sessionKey,
  signedInAs,
  submitLogin,
  totp,
};
