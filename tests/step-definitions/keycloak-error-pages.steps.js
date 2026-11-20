'use strict';

// The server's error pages ("We are sorry..."): a sign-in started for an app the realm does not know, or
// with an address the app's client does not allow to come back to, and the way back to the app.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

/**
 * Start a sign-in at the server for a client of the realm (its client ID), as an app does, coming back to
 * an address (the app's own when none is given): an unknown client, or an address the client does not
 * allow, ends on the server's error page.
 *
 * Example #1: When I start a sign-in for the client "webship-app" with the redirect "https://wrong.example.org/"
 * Example #2: When I start a sign-in for the client "no-such-client"
 * Example #3: When we start a sign-in for the client "webship-app"
 * Example #4: When I start a sign-in for the client "webship-partner" with the redirect "https://keycloaksteps.ddev.site/elsewhere/"
 * Example #5: When I start a sign-in for the client "account-console" with the redirect "https://wrong.example.org/"
 */
When(/^(?:I|we) start a sign-in for the client "([^"]*)"(?: with the redirect "([^"]*)")?$/, async function (client, redirect) {
  // As an app does: a state, a nonce and a PKCE challenge (S256), which a client that requires PKCE asks for.
  const challenge = require('crypto').createHash('sha256').update(require('crypto').randomBytes(32).toString('base64url')).digest('base64url');
  const params = new URLSearchParams({ client_id: client, redirect_uri: redirect || `${h.appRoot(this)}/`, response_type: 'code', scope: 'openid', state: 'webship-steps', nonce: 'webship-steps', code_challenge: challenge, code_challenge_method: 'S256' });
  await h.open(this, `${h.oidcUrl(this, 'auth')}?${params}`);
});

/**
 * The page is the server's error page ("We are sorry...") with a message: "Invalid parameter:
 * redirect_uri", "Client not found.", "Page not found".
 *
 * Example #1: Then I should see the error page "Invalid parameter: redirect_uri"
 * Example #2: Then I should see the error page "Client not found."
 * Example #3: Then we should see the error page "Page not found"
 * Example #4: And I should see the error page "redirect_uri"
 * Example #5: Then I should see the error page "Action expired."
 */
Then(/^(?:I|we) should see the error page "([^"]*)"$/, async function (expected) {
  const page = this.page;
  const message = page.locator('#kc-error-message');
  await message.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await message.first().isVisible().catch(() => false))) throw h.fail(this, `The page is not the server's error page: ${await h.pageSummary(this)}.`, 'The server shows "We are sorry..." and its message on its error page.');
  const text = h.clean(await message.first().innerText());
  if (!h.mentions(text, expected)) throw friendly({ message: `The error page says "${text.replace(/\s*«.*$/, '')}", not "${expected}".`, hint: 'Look at the screenshot of the failure.' });
});

/**
 * Follow the error or information page's link back to the app ("« Back to Application").
 *
 * Example #1: When I go back to the application
 * Example #2: When we go back to the application
 * Example #3: And I go back to the application
 * Example #4: When I go back to the application
 *               Then I should be back in the app
 * Example #5: When I go back to the application
 *               Then I should see "Webship test app"
 */
When(/^(?:I|we) go back to the application$/, async function () {
  const link = this.page.getByRole('link', { name: /Back to Application/i }).or(this.page.locator('#backToApplication')).first();
  if (!(await link.isVisible().catch(() => false))) throw h.fail(this, `The page has no "« Back to Application" link: ${await h.pageSummary(this)}.`, 'The server shows it on its error and information pages when it knows the app.');
  await h.navigating(this, () => link.click());
});
