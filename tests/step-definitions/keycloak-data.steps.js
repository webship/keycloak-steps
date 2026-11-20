'use strict';

// Test data: an account of the users registry put into the state a scenario needs, through the server's
// admin REST API as the data administrator (worldParameters.dataAdmin), and put back after the scenario: a
// required action the server will ask for at the next login (update the password, verify the email, set up
// a one-time code), and an app's grant taken away. The account's sessions end first, so its next sign-in
// meets what the step set. Accounts are never made or deleted here: they are configuration.

const { Given } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

// The required actions, by the words of a step: the server's alias of each.
const ACTIONS = {
  'update its password': 'UPDATE_PASSWORD',
  'verify its email': 'VERIFY_EMAIL',
  'set up a one-time code': 'CONFIGURE_TOTP',
};

/** End every session of an account at the server (and forget the one this run kept). */
async function endSessions(world, api, user, account) {
  const res = await api.call('POST', `/users/${user.id}/logout`);
  if (res.status >= 400) throw friendly({ message: `The server did not end the sessions of "${account.username}" (status ${res.status}).`, hint: 'The data administrator needs the realm\'s admin rights (realm-management: realm-admin).' });
  h.dropSession(world, account.username);
}

/**
 * Make the server ask an account of the users registry for a required action at its next login: a new
 * password, a verified email (its email is set as not verified), or a one-time code to set up. Its sessions
 * end, so the browser must log in again. The clean-up gives the account back its state after the scenario.
 *
 * Example #1: Given the account "user" must update its password
 * Example #2: Given the account "user" must verify its email
 * Example #3: Given the account "user" must set up a one-time code
 * Example #4: Given the account "editor" must update its password
 * Example #5: And the account "user" must verify its email
 */
Given(/^the account "([^"]*)" must (update its password|verify its email|set up a one-time code)$/, async function (handle, what) {
  const action = ACTIONS[what];
  await h.restoreAccountAfter(this, handle);
  const { api, account, user } = await h.adminUser(this, handle);
  const body = { requiredActions: [...new Set([...(user.requiredActions || []), action])] };
  if (action === 'VERIFY_EMAIL') body.emailVerified = false;
  const res = await api.call('PUT', `/users/${user.id}`, body);
  if (res.status >= 400) throw friendly({ message: `The server did not set the required action ${action} on "${account.username}" (status ${res.status}).`, hint: 'The required action must be enabled in the realm (Authentication, Required actions).' });
  await endSessions(this, api, user, account);
});

/**
 * Take away an app's grant of an account of the users registry, so the app's consent screen comes at the
 * next sign-in: the app by its client's name or its client ID. A grant the scenario gives is taken back
 * after it too.
 *
 * Example #1: Given "user" has not granted access to "Webship partner app"
 * Example #2: Given "user" has not granted access to "webship-partner"
 * Example #3: Given "editor" has not granted access to "Webship partner app"
 * Example #4: And "user" has not granted access to "Webship partner app"
 * Example #5: Given "otpuser" has not granted access to "webship-partner"
 */
Given(/^"([^"]*)" has not granted access to "([^"]*)"$/, async function (handle, app) {
  await h.restoreAccountAfter(this, handle);
  const { api, account, user } = await h.adminUser(this, handle);
  const clients = await api.call('GET', `/clients?search=false&clientId=${encodeURIComponent(app)}`);
  let client = Array.isArray(clients.json) && clients.json.find((c) => h.same(c.clientId, app));
  if (!client) {
    const all = await api.call('GET', '/clients?max=200');
    client = (Array.isArray(all.json) ? all.json : []).find((c) => h.same(c.name || '', app));
  }
  if (!client) throw friendly({ message: `The realm has no app "${app}" (by client ID or name).`, hint: 'Name the app by its client\'s name or its client ID.' });
  const res = await api.call('DELETE', `/users/${user.id}/consents/${encodeURIComponent(client.clientId)}`);
  if (res.status >= 400 && res.status !== 404) throw friendly({ message: `The server did not take back the grant of "${client.clientId}" for "${account.username}" (status ${res.status}).`, hint: 'The data administrator needs the realm\'s admin rights.' });
  await endSessions(this, api, user, account);
});
