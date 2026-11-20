'use strict';

// The consent screen: an app of another party asks the account to grant it access to its data first. The
// steps read the app and the access it asks for, and answer "Yes" or "No". A grant the scenario gives is
// taken back after it.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

/** The app the consent screen names ("Grant Access to <app>"). */
async function consentApp(page) {
  const title = h.clean(await page.locator('#kc-page-title, h1').first().innerText({ timeout: 2000 }).catch(() => ''));
  return title.replace(/^Grant Access to\s+/i, '');
}

/**
 * The server asks the account to grant an app access (its consent screen, "Grant Access to <app>").
 *
 * Example #1: Then I should be asked to grant access to "Webship partner app"
 * Example #2: Then we should be asked to grant access to "Webship partner app"
 * Example #3: And I should be asked to grant access to "Webship partner app"
 * Example #4: Then I should be asked to grant access to "Webship partner app"
 *               When I grant access
 * Example #5: Then I should be asked to grant access to "partner app"
 */
Then(/^(?:I|we) should be asked to grant access to "([^"]*)"$/, async function (app) {
  await h.expectLoginPage(this, 'consent', 'The server asks for consent when the app\'s client has "Consent required" on and the account has not granted it access yet.');
  const named = await consentApp(this.page);
  if (!h.mentions(named, app)) throw friendly({ message: `The consent screen asks access for "${named}", not "${app}".`, hint: 'The screen names the app by its client\'s name.' });
});

/**
 * The consent screen lists an access the app asks for (a scope by the words a person reads: "User
 * profile", "Email address", "User roles").
 *
 * Example #1: Then the consent screen should ask for "Email address"
 * Example #2: Then the consent screen should ask for "User profile"
 * Example #3: And the consent screen should ask for "User roles"
 * Example #4: Then the consent screen should ask for "Email"
 * Example #5: But the consent screen should ask for "User profile"
 */
Then(/^the consent screen should ask for "([^"]*)"$/, async function (access) {
  await h.expectLoginPage(this, 'consent', 'The consent screen comes after the login for an app that asks for consent.');
  const items = (await this.page.locator('#kc-oauth li, main li').allInnerTexts()).map(h.clean).filter(Boolean);
  if (!items.some((i) => h.mentions(i, access))) throw friendly({ message: `The consent screen does not ask for "${access}". It asks for ${h.listed(items)}.`, hint: 'It lists the client scopes of the app that need consent, by their consent text.' });
});

/**
 * Answer the consent screen: "Yes" grants the app access and the browser goes back to it signed in; "No"
 * refuses, and the browser goes back to the app with the refusal. A grant is taken back after the scenario.
 *
 * Example #1: When I grant access
 * Example #2: When I deny access
 * Example #3: When we grant access
 * Example #4: When we deny access
 * Example #5: And I grant access
 */
When(/^(?:I|we) (grant|deny) access$/, async function (answer) {
  await h.expectLoginPage(this, 'consent', 'The consent screen comes after the login for an app that asks for consent.');
  const handle = this.__signInAttempt || this.__signInUser;
  if (answer === 'grant' && handle) await h.restoreAccountAfter(this, handle);
  const name = answer === 'grant' ? 'Yes' : 'No';
  const button = this.page.getByRole('button', { name, exact: true }).or(this.page.locator(answer === 'grant' ? 'button[name="accept"], input[name="accept"]' : 'button[name="cancel"], input[name="cancel"]')).first();
  await h.navigating(this, () => button.click());
  if (answer === 'grant' && handle && !(await h.loginPage(this))) {
    await h.keepSession(this, handle);
    this.__signInUser = handle;
  }
});

module.exports = { consentApp };
