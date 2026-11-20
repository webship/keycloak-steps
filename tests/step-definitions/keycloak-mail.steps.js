'use strict';

// The mail the server sends (a password reset, an email verification), read from the mail catcher of the
// site (worldParameters.mailUrl, a Mailpit): a mail that came to an account, what it says, and its links.
// A step reads the mail that came since the scenario started, or since the step that asked for it: never a
// mail of an earlier scenario or run.

const { Before, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./keycloak-helpers');

Before(function () {
  this.__mailAskedAt = 0;
  this.__scenarioStartedAt = Date.now();
});

/** The moment from which a mail step reads the mailbox (a second earlier: the clocks of the server and the machine). */
function mailSince(world) {
  return (world.__mailAskedAt || world.__scenarioStartedAt || 0) - 1000;
}

/** The newest mail to an address with a subject since the scenario (or the request) began, waiting for it to come. */
async function waitForMail(world, address, subject) {
  let seen = [];
  const found = await h.eventually(world, async () => {
    const all = await h.mailTo(world, address);
    seen = all.filter((m) => Date.parse(m.Created) >= mailSince(world));
    return seen.find((m) => h.mentions(m.Subject, subject)) || null;
  }, (m) => !!m, async () => ({
    message: `No mail "${subject}" came to ${address}${seen.length ? `; it got ${h.listed(seen.map((m) => m.Subject))}` : ''}.`,
    hint: `The server sends its mail to the mail catcher (${h.mailUrl(world)}); check the realm's email settings (realm settings, Email) and the mail catcher's own list.`,
  }), h.budget(world));
  return found;
}

/**
 * A mail with a subject came to an account of the users registry (its email) or to an address, since the
 * scenario began.
 *
 * Example #1: Then an email with the subject "Reset password" should be sent to "user"
 * Example #2: Then an email with the subject "Verify email" should be sent to "user"
 * Example #3: Then an email with the subject "Reset password" should be sent to "user@example.com"
 * Example #4: And an email with the subject "Reset password" should be sent to "editor"
 * Example #5: Then an email with the subject "Verify" should be sent to "user"
 */
Then(/^an email with the subject "([^"]*)" should be sent to "([^"]*)"$/, async function (subject, who) {
  await waitForMail(this, h.addressOf(this, who), subject);
});

/**
 * No mail came to an address since the scenario began (the server answers a password reset for an unknown
 * address as for a known one, and sends nothing). The step waits a moment for a mail that is late.
 *
 * Example #1: Then no email should be sent to "nobody@example.com"
 * Example #2: Then no email should be sent to "user"
 * Example #3: And no email should be sent to "nobody@example.com"
 * Example #4: Then no email should be sent to "someone-else@example.org"
 * Example #5: But no email should be sent to "nobody@example.com"
 */
Then(/^no email should be sent to "([^"]*)"$/, async function (who) {
  const address = h.addressOf(this, who);
  // The server sends its mail before it answers the form; a mail on its way is in the catcher within a moment.
  const deadline = Date.now() + 3000;
  for (;;) {
    const came = (await h.mailTo(this, address)).filter((m) => Date.parse(m.Created) >= mailSince(this));
    if (came.length) throw friendly({ message: `A mail came to ${address}: ${h.listed(came.map((m) => m.Subject))}.`, hint: 'Look at the mail catcher.' });
    if (Date.now() > deadline) return;
    await this.page.waitForTimeout(250);
  }
});

/**
 * The mail with a subject to an account or an address says a text (in its plain text or its HTML).
 *
 * Example #1: Then the email with the subject "Reset password" to "user" should contain "This link and code will expire within 5 minutes."
 * Example #2: Then the email with the subject "Verify email" to "user" should contain "verify your email address"
 * Example #3: Then the email with the subject "Reset password" to "user@example.com" should contain "Webship test sign-in"
 * Example #4: And the email with the subject "Reset password" to "user" should contain "reset them"
 * Example #5: Then the email with the subject "Reset password" to "editor" should contain "If this was you"
 */
Then(/^the email with the subject "([^"]*)" to "([^"]*)" should contain "([^"]*)"$/, async function (subject, who, expected) {
  const address = h.addressOf(this, who);
  const found = await waitForMail(this, address, subject);
  const message = await h.mailMessage(this, found.ID);
  const text = `${message.Text || ''} ${String(message.HTML || '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')}`;
  if (!h.mentions(text, expected)) throw friendly({ message: `The mail "${message.Subject}" to ${address} does not say "${expected}". It says: "${h.clean(message.Text || '').slice(0, 300)}".`, hint: 'The text of the server\'s mails comes from its email theme and the realm\'s display name.' });
});

/**
 * Open a link of the newest mail to an account or an address, by the words of the link ("Link to reset
 * credentials", "Link to e-mail address verification"), in the browser.
 *
 * Example #1: When I open the "Link to reset credentials" link of the email to "user"
 * Example #2: When I open the "Link to e-mail address verification" link of the email to "user"
 * Example #3: When we open the "Link to reset credentials" link of the email to "user@example.com"
 * Example #4: When I open the "Link to reset credentials" link of the email to "editor"
 * Example #5: And I open the "reset credentials" link of the email to "user"
 */
When(/^(?:I|we) open the "([^"]*)" link of the email to "([^"]*)"$/, async function (words, who) {
  const address = h.addressOf(this, who);
  const all = (await h.mailTo(this, address)).filter((m) => Date.parse(m.Created) >= mailSince(this));
  if (!all.length) throw friendly({ message: `No mail came to ${address} in this scenario.`, hint: 'A step that makes the server send a mail comes first ("When I ask for a password reset link for "…"").' });
  let link = null;
  let links = [];
  for (const m of all) {
    links = h.mailLinks(await h.mailMessage(this, m.ID));
    link = links.find((l) => h.same(l.text, words)) || links.find((l) => h.mentions(l.text, words));
    if (link) break;
  }
  if (!link) throw friendly({ message: `No mail to ${address} has a link "${words}". The newest has ${h.listed(links.map((l) => l.text))}.`, hint: 'Name the link by its words in the mail.' });
  const handle = h.handleOf(this, who);
  if (handle && !this.__signInAttempt) this.__signInAttempt = handle;
  await h.open(this, link.href);
});

module.exports = { waitForMail };
