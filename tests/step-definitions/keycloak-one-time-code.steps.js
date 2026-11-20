'use strict';

// One-time codes: the server's page that asks for the code after the password, a code worked out from an
// account's secret the way an authenticator app does it, a code that is refused, and setting a code up
// (the required action "Configure OTP"): the key the page gives a person who cannot scan the barcode, the
// code it gives, the name of the device.

const { When, Then } = require('@cucumber/cucumber');
const h = require('./keycloak-helpers');

/** The settings the set-up page shows for the code: its algorithm, digits and period. */
async function codeSettings(page) {
  const text = async (sel) => h.clean(await page.locator(sel).first().innerText({ timeout: 1000 }).catch(() => ''));
  const algorithm = ((await text('#kc-totp-algorithm')).match(/SHA\s*-?\s*(1|256|512)/i) || [])[1] || '1';
  const digits = parseInt(((await text('#kc-totp-digits')).match(/(\d+)/) || [])[1] || '6', 10);
  const period = parseInt(((await text('#kc-totp-period')).match(/(\d+)/) || [])[1] || '30', 10);
  return { algorithm: `sha${algorithm}`, digits, period };
}

/**
 * The server asks for the one-time code after the password: its page with the "One-time code" field.
 *
 * Example #1: Then I should be asked for a one-time code
 * Example #2: Then we should be asked for a one-time code
 * Example #3: And I should be asked for a one-time code
 * Example #4: Then I should be asked for a one-time code
 *               When I enter the one-time code of "otpuser"
 * Example #5: Then I should be asked for a one-time code
 *               And I should see "otpuser"
 */
Then(/^(?:I|we) should be asked for a one-time code$/, async function () {
  await h.expectLoginPage(this, 'one-time code', 'An account with a one-time code set up is asked for it after its password.');
});

/**
 * Type the one-time code of an account of the users registry on the server's code page and send it: the
 * code its secret gives now (users.<handle>.otpSecret in cucumber.js, the base32 key an authenticator app
 * is given), or the key of a code this scenario set up. A code is taken once: a second sign-in in the same
 * 30-second window waits for the next window's code, as a person does.
 *
 * Example #1: When I enter the one-time code of "otpuser"
 * Example #2: When we enter the one-time code of "otpuser"
 * Example #3: And I enter the one-time code of "otpuser"
 * Example #4: When I enter the one-time code of "user"
 * Example #5: When I enter the one-time code of "otpuser"
 *               Then I should be back in the app
 */
When(/^(?:I|we) enter the one-time code of "([^"]*)"$/, { timeout: 120000 }, async function (handle) {
  const account = h.resolveUser(this, handle);
  if (!account.otpSecret) throw h.fail(this, `The users registry has no otpSecret for "${handle}".`, `Set worldParameters.users.${handle}.otpSecret in cucumber.js to the account's key (base32, as an authenticator app gets it).`);
  await h.expectLoginPage(this, 'one-time code', 'The server asks for the code after the password ("When I submit the login form as "…"").');
  await h.enterComputedCode(this, account.otpSecret, { submit: () => h.submitLogin(this, ['Sign In', 'Log In', 'Submit']) });
  if (!(await h.loginPage(this))) {
    await h.keepSession(this, handle);
    this.__signInUser = handle;
  }
});

/**
 * Type a given one-time code and send it, on the code page after the password or on the set-up page: a
 * code the server must refuse.
 *
 * Example #1: When I enter the one-time code "123456"
 * Example #2: When I enter the one-time code "000000"
 * Example #3: When we enter the one-time code "999999"
 * Example #4: When I enter the one-time code ""
 * Example #5: When I enter the one-time code "12345"
 */
When(/^(?:I|we) enter the one-time code "([^"]*)"$/, async function (code) {
  const where = await h.loginPage(this);
  if (where !== 'one-time code' && where !== 'set up a one-time code') throw h.fail(this, `The page asks for no one-time code: ${await h.pageSummary(this)}.`, 'The server asks for it after the password of an account with a code, and on its set-up page.');
  await (await h.needField(this, 'One-time code')).fill(code);
  await h.submitLogin(this, ['Sign In', 'Log In', 'Submit']);
});

/**
 * The page asks for the code again, with the server's refusal under the field ("Invalid authenticator
 * code.").
 *
 * Example #1: Then the one-time code should be refused with "Invalid authenticator code."
 * Example #2: Then the one-time code should be refused with "Invalid authenticator code"
 * Example #3: And the one-time code should be refused with "Invalid authenticator code."
 * Example #4: Then the one-time code should be refused with "authenticator code"
 * Example #5: Then the one-time code should be refused with "Please specify authenticator code."
 */
Then(/^the one-time code should be refused with "([^"]*)"$/, async function (expected) {
  await h.eventually(this, async () => {
    const where = await h.loginPage(this);
    const input = await h.field(this.page, 'One-time code');
    const own = input ? await h.fieldError(this.page, input) : '';
    return { where, messages: [own, ...(await h.pageMessages(this.page))].filter(Boolean) };
  }, (r) => ['one-time code', 'set up a one-time code'].includes(r.where) && r.messages.some((m) => h.mentions(m, expected)),
  async (r) => ({
    message: ['one-time code', 'set up a one-time code'].includes(r.where) ? `The page does not show "${expected}". It shows ${h.listed(r.messages)}.` : `The code was not refused: ${await h.pageSummary(this)}.`,
    hint: 'The server shows a refused code under the "One-time code" field and asks for it again.',
  }), 5000);
});

/**
 * The server asks the account to set up a one-time code before it lets it in (the required action
 * "Configure OTP"): its page "Mobile Authenticator Setup".
 *
 * Example #1: Then I should be asked to set up a one-time code
 * Example #2: Then we should be asked to set up a one-time code
 * Example #3: And I should be asked to set up a one-time code
 * Example #4: Then I should be asked to set up a one-time code
 *               When I set up a one-time code named "Test laptop"
 * Example #5: Then I should be asked to set up a one-time code
 *               And I should see "Mobile Authenticator Setup"
 */
Then(/^(?:I|we) should be asked to set up a one-time code$/, async function () {
  await h.expectLoginPage(this, 'set up a one-time code', 'The server asks for it when the account has the required action "Configure OTP" ("Given the account "…" must set up a one-time code").');
});

/**
 * Set a one-time code up on the server's set-up page, as a person with an authenticator app does: "Unable to
 * scan?" shows the key, the app gives the code of that key, the code and a device name go in, "Submit". The
 * key is kept for the scenario: "I enter the one-time code of "…"" works its codes out. The clean-up deletes
 * the code set up after the scenario.
 *
 * Example #1: When I set up a one-time code named "Test laptop"
 * Example #2: When we set up a one-time code named "Test laptop"
 * Example #3: When I set up a one-time code named "Work phone"
 * Example #4: When I set up a one-time code named "Test laptop"
 *               Then I should be back in the app
 * Example #5: When I set up a one-time code named ""
 */
When(/^(?:I|we) set up a one-time code named "([^"]*)"$/, { timeout: 120000 }, async function (device) {
  const page = this.page;
  await h.expectLoginPage(this, 'set up a one-time code', 'The server shows it for the required action "Configure OTP", or from the account console ("Set up Authenticator application").');
  let keyText = page.locator('#kc-totp-secret-key');
  if (!(await keyText.isVisible().catch(() => false))) {
    const manual = page.getByRole('link', { name: 'Unable to scan?', exact: true }).or(page.locator('#mode-manual')).first();
    if (!(await manual.isVisible().catch(() => false))) throw h.fail(this, 'The set-up page shows neither the key nor "Unable to scan?".', 'The default login theme shows the key under "Unable to scan?".');
    await h.navigating(this, () => manual.click());
    keyText = page.locator('#kc-totp-secret-key');
  }
  const key = h.clean(await keyText.innerText()).replace(/\s+/g, '');
  const settings = await codeSettings(page);
  const handle = this.__signInAttempt || this.__signInUser || h.handleOf(this, h.clean(await page.locator('#kc-attempted-username').inputValue().catch(() => '')));
  if (handle && h.cleansUp(this)) await h.restoreAccountAfter(this, handle);
  await (await h.needField(this, 'One-time code')).fill(await h.freshCode(this, key, settings));
  if (device) await (await h.needField(this, 'Device Name')).fill(device);
  await h.submitLogin(this, ['Submit', 'Save']);
  if ((await h.loginPage(this)) === 'set up a one-time code') {
    const messages = await h.pageMessages(page);
    throw h.fail(this, `The server did not take the code of the key it showed${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'The code of the key is worked out with the algorithm, digits and period the page shows; check that the clock of the machine is right.');
  }
  if (handle) h.otpKeyChanged(this, handle, key);
});

module.exports = { codeSettings };
