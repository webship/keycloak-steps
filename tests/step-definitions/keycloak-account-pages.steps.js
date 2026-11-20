'use strict';

// The pages of the login flow around an account: "Forgot Password?" and the page that sets a new password,
// the required actions the server asks for before it lets an account in ("Update password", "Email
// verification"), the registration form (its refusals only: a suite never makes an account), and the
// messages of these pages: the error under a field, the message over the form.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');
const { startSignIn } = require('./keycloak-session.steps');

/** Open the login form (from the app, when the browser is not on it) and follow its link `name`. */
async function fromLoginForm(world, name, page) {
  if ((await h.loginPage(world)) !== 'login') {
    const where = await startSignIn(world);
    if (where === 'app') throw h.fail(world, 'The server sent the browser straight back to the app: it is signed in already.', 'Start from "Given I am not logged in".');
  }
  const link = world.page.getByRole('link', { name, exact: true }).first();
  if (!(await link.isVisible().catch(() => false))) {
    throw h.fail(world, `The login form has no "${name}" link: ${await h.pageSummary(world)}.`, page === 'registration' ? 'The realm offers registration when its setting "User registration" is on (realm settings, Login).' : 'The realm offers it when its setting "Forgot password" is on (realm settings, Login).');
  }
  await h.navigating(world, () => link.click());
  await h.expectLoginPage(world, page, `The link "${name}" of the login form opens the ${page} page.`);
}

/**
 * Ask for a password reset, as a person does: "Forgot Password?" on the login form, the username or email
 * of an account of the users registry (anything else is typed as it is), "Submit". The server sends the
 * account a mail with a link and shows its message over the login form; it answers the same for an
 * address it does not know.
 *
 * Example #1: When I ask for a password reset link for "user"
 * Example #2: When I ask for a password reset link for "nobody@example.com"
 * Example #3: When we ask for a password reset link for "editor"
 * Example #4: When I ask for a password reset link for "user@example.com"
 * Example #5: When I ask for a password reset link for "user" again
 */
When(/^(?:I|we) ask for a password reset link for "([^"]*)"( again)?$/, async function (who, again) { // eslint-disable-line no-unused-vars
  const handle = h.handleOf(this, who);
  const login = handle ? h.resolveUser(this, handle).username : who;
  if ((await h.loginPage(this)) !== 'forgot password') await fromLoginForm(this, 'Forgot Password?', 'forgot password');
  this.__mailAskedAt = Date.now();
  await (await h.needField(this, 'Username or email')).fill(login);
  await h.submitLogin(this, ['Submit']);
  this.__signInAttempt = handle || null;
});

/**
 * The page shows the server's message over the form (an alert of the login pages: "You should receive an
 * email shortly with further instructions.", "Your account has been updated."), or does not.
 *
 * Example #1: Then I should see the status message "You should receive an email shortly with further instructions."
 * Example #2: Then I should see the status message "You should receive an email shortly"
 * Example #3: Then we should see the status message "Your email address has been verified."
 * Example #4: Then I should not see the status message "Invalid username or password."
 * Example #5: Then I should see the status message "further instructions"
 */
Then(/^(?:I|we) should( not)? see the status message "([^"]*)"$/, async function (not, expected) {
  const read = async () => [...(await h.alerts(this.page)), ...(await this.page.locator('#kc-info-message, .instruction').allInnerTexts().catch(() => [])).map(h.clean)].filter(Boolean);
  if (not) {
    const shown = await read();
    if (shown.some((m) => h.mentions(m, expected))) throw friendly({ message: `The page shows the message "${expected}".`, hint: 'Look at the screenshot of the failure.' });
    return;
  }
  await h.eventually(this, read, (msgs) => msgs.some((m) => h.mentions(m, expected)),
    async (msgs) => ({ message: `The page does not show the message "${expected}". It shows ${h.listed(msgs)}: ${await h.pageSummary(this)}.`, hint: 'The login pages show their messages in an alert over the form.' }), 5000);
});

/**
 * The server asks the account for a new password: the page "Update password" of a password reset link or
 * of the required action "Update Password".
 *
 * Example #1: Then I should be asked to update my password
 * Example #2: Then we should be asked to update our password
 * Example #3: And I should be asked to update my password
 * Example #4: Then I should be asked to update my password
 *               When I choose a new password
 * Example #5: Then I should be asked to update my password
 *               And I should see "Update password"
 */
Then(/^(?:I|we) should be asked to update (?:my|our) password$/, async function () {
  await h.expectLoginPage(this, 'update password', 'The server asks for it after a password reset link, or for the required action "Update Password" ("Given the account "…" must update its password").');
});

/**
 * Choose a new password on the page "Update password", as a person does: a new password nobody chose
 * before, typed twice, "Submit". The scenario's later steps sign the account in with it; the clean-up
 * gives the account back the password of the users registry after the scenario.
 *
 * Example #1: When I choose a new password
 * Example #2: When we choose a new password
 * Example #3: And I choose a new password
 * Example #4: When I choose a new password
 *               Then I should be back in the app
 * Example #5: When I choose a new password
 *               Then I should be logged in as "user"
 */
When(/^(?:I|we) choose a new password$/, async function () {
  await h.expectLoginPage(this, 'update password', 'The page "Update password" comes after a password reset link or for the required action "Update Password".');
  const handle = this.__signInAttempt || this.__signInUser;
  if (!handle) throw h.fail(this, 'The step does not know whose password this is.', 'Start the flow with a step that names the account: "When I ask for a password reset link for "user"" or "When I log in as "user" with the login form".');
  await h.restoreAccountAfter(this, handle);
  const password = h.newPassword();
  await (await h.needField(this, 'New Password')).fill(password);
  await (await h.needField(this, 'Confirm password')).fill(password);
  await h.submitLogin(this, ['Submit']);
  if ((await h.loginPage(this)) === 'update password') {
    const messages = await h.pageMessages(this.page);
    throw h.fail(this, `The server did not take the new password${messages.length ? `: it says ${h.listed(messages)}` : ''}.`, 'A realm with a password policy says what it asks for under the field.');
  }
  h.passwordChanged(this, handle, password);
  if (!(await h.loginPage(this))) {
    await h.keepSession(this, handle);
    this.__signInUser = handle;
  }
});

/**
 * Type a new password and its confirmation on the page "Update password" and send them: a choice the
 * server must refuse (they differ, or a policy of the realm refuses them).
 *
 * Example #1: When I choose the new password "Webship-New-Pass-1" confirmed as "Webship-Other-Pass-2"
 * Example #2: When I choose the new password "" confirmed as ""
 * Example #3: When we choose the new password "Webship-New-Pass-1" confirmed as "Webship-New-Pass-2"
 * Example #4: When I choose the new password "short" confirmed as "short"
 * Example #5: When I choose the new password "Webship-New-Pass-1" confirmed as "webship-new-pass-1"
 */
When(/^(?:I|we) choose the new password "([^"]*)" confirmed as "([^"]*)"$/, async function (password, confirmation) {
  await h.expectLoginPage(this, 'update password', 'The page "Update password" comes after a password reset link or for the required action "Update Password".');
  const handle = this.__signInAttempt || this.__signInUser;
  if (handle) await h.restoreAccountAfter(this, handle);
  await (await h.needField(this, 'New Password')).fill(password);
  await (await h.needField(this, 'Confirm password')).fill(confirmation);
  await h.submitLogin(this, ['Submit']);
  if (password && password === confirmation && !(await h.loginPage(this)) && handle) h.passwordChanged(this, handle, password);
});

/**
 * The server asks the account to verify its email before it lets it in (the required action "Verify
 * Email"): its page "Email verification", and a mail with a link on its way.
 *
 * Example #1: Then I should be asked to verify my email
 * Example #2: Then we should be asked to verify our email
 * Example #3: And I should be asked to verify my email
 * Example #4: Then I should be asked to verify my email
 *               When I open the "Link to e-mail address verification" link of the email to "user"
 * Example #5: Then I should be asked to verify my email
 *               And an email with the subject "Verify email" should be sent to "user"
 */
Then(/^(?:I|we) should be asked to verify (?:my|our) email$/, async function () {
  await h.expectLoginPage(this, 'verify email', 'The server asks for it when the account\'s email is not verified and the required action "Verify Email" is set ("Given the account "…" must verify its email").');
});

/** The registration form's fields, by the labels of a person, as a data table gives them. */
async function fillRegistration(world, rows) {
  for (const [label, value] of rows) {
    const handleMatch = String(value).match(/^the (password|email|username) of "([^"]+)"$/);
    let text = value;
    if (handleMatch) {
      const account = h.resolveUser(world, handleMatch[2]);
      text = handleMatch[1] === 'password' ? account.password : handleMatch[1] === 'email' ? account.email : account.username;
    }
    await (await h.needField(world, label)).fill(text);
  }
}

/**
 * Fill the server's registration form in ("Register" on the login form) from a table of labels and values,
 * and send it: a sign-up the server must refuse (a taken username or email, a mismatch, a missing field). A
 * suite never makes an account: when the server takes the sign-up, the step fails and says how to remove it.
 *
 * Example #1: When I try to register with:
 * Example #2: When we try to register with:
 * Example #3: When I try to register with:
 *               | Username | user |
 * Example #4: When I try to register with:
 *               | Email | not-an-address |
 * Example #5: And I try to register with:
 */
When(/^(?:I|we) try to register with:$/, async function (table) {
  if ((await h.loginPage(this)) !== 'registration') await fromLoginForm(this, 'Register', 'registration');
  const rows = table.raw().filter((r) => r.length >= 2);
  if (!rows.length) throw friendly({ message: 'The table gives no field.', hint: 'One row per field: | Username | user |.' });
  await fillRegistration(this, rows);
  const button = this.page.getByRole('button', { name: 'Register', exact: true }).or(this.page.locator('#kc-register-form [type=submit]')).first();
  await h.navigating(this, () => button.click());
  if ((await h.loginPage(this)) !== 'registration') {
    const username = (rows.find((r) => h.same(r[0], 'Username')) || [])[1] || '(the email given)';
    throw h.fail(this, `The server took the sign-up: it made the account "${username}". A suite never makes an account.`, 'Delete it in the admin console (Users), then give the step data the server refuses. Registration is tested through its refusals only.');
  }
});

/**
 * A field of the page shows the server's error under it, or shows none: the field by the label a person
 * reads ("Username", "Email", "Confirm password", "New Password", "One-time code").
 *
 * Example #1: Then the "Username" field should have the error "Username already exists."
 * Example #2: Then the "Email" field should have the error "Invalid email address."
 * Example #3: Then the "Confirm password" field should have the error "Password confirmation doesn't match."
 * Example #4: Then the "Email" field should not have the error "Email already exists."
 * Example #5: Then the "First name" field should have the error "Please specify this field."
 */
Then(/^the "([^"]*)" field should( not)? have the error "([^"]*)"$/, async function (label, not, expected) {
  const input = await h.needField(this, label);
  if (not) {
    const shown = await h.fieldError(this.page, input);
    if (shown && h.mentions(shown, expected)) throw friendly({ message: `The "${label}" field shows the error "${shown}".`, hint: 'Look at the screenshot of the failure.' });
    return;
  }
  await h.eventually(this, async () => h.fieldError(this.page, input), (shown) => h.mentions(shown, expected),
    async (shown) => ({ message: `The "${label}" field does not show the error "${expected}"${shown ? `: it shows "${shown}"` : ': it shows no error'}.`, hint: 'The server shows a refused field\'s error under it, after the form came back.' }), 5000);
});

/**
 * A field of the page shows no error under it.
 *
 * Example #1: Then the "Username" field should have no error
 * Example #2: Then the "Email" field should have no error
 * Example #3: Then the "First name" field should have no error
 * Example #4: Then the "Last name" field should have no error
 * Example #5: Then the "Password" field should have no error
 */
Then(/^the "([^"]*)" field should have no error$/, async function (label) {
  const input = await h.needField(this, label);
  const shown = await h.fieldError(this.page, input);
  if (shown) throw friendly({ message: `The "${label}" field shows the error "${shown}".`, hint: 'Look at the screenshot of the failure.' });
});

module.exports = { fromLoginForm };
