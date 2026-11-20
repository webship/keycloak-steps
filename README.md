<p align="center"><img src="https://raw.githubusercontent.com/webship/keycloak-steps/2.0.x/assets/logo.svg" alt="Keycloak logo" width="96"></p>

# keycloak-steps

[![Test](https://github.com/webship/keycloak-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/keycloak-steps/actions/workflows/test.yml)

Cucumber step definitions for testing the sign-in of any app that uses Keycloak, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on
Playwright and Cucumber-js.

An app that signs its people in through a Keycloak server sends them to the server's pages: the login
form, a one-time code, a required action, the consent screen, an error page, then back to the app.
`@webship-js/keycloak-steps` covers those pages, whatever the app, and the server's own consoles:

- **the session**: signing in through the app (its sign-in button sends the browser to the server and
  back), or taking over an account's session from earlier in the run; the login form and its refusals,
  "Remember me" and a browser that is closed and opened again; logging out; who the server says is
  signed in;
- **one-time codes**: the code page after the password, the code worked out from an account's key the
  way an authenticator app does it, a refused code, setting a code up when the server asks for it;
- **the account pages of the login flow**: "Forgot Password?" and the mail with its link, choosing a new
  password, verifying the email through its mail, the registration form's refusals, the error under a
  field and the message over the form;
- **mail**: the mails the server sends, read from the mail catcher of the site;
- **the consent screen** of an app of another party: what it asks for, yes and no;
- **the error pages**: an address an app's client does not allow, an unknown client, a missing page, the
  way back to the app;
- **the account console**: the personal info and its save, the authenticators (set up and deleted), the
  device activity, the applications with their access, signing out;
- **the admin console**: finding and opening a user, their details and roles, resetting a test
  account's password (also as a temporary one), the realm's clients and roles, the refusal of an account
  without the realm's admin rights;
- **test data**: an account made to update its password, verify its email or set up a code at its next
  login, or without an app's grant, through the server's admin REST API; whatever a scenario changes on
  an account (its password, its required actions, a code it set up, a grant, its names) is put back
  after it.

No step phrase names the platform: a scenario reads `When I enter the one-time code of "otpuser"` and
`Then I should be asked to grant access to "Webship partner app"`.

CI builds a real site with [DDEV](https://ddev.com) on the runner (the sign-in server at its current
release in its official container, the test realm and the accounts of [A test site](#a-test-site), and a
small test app next to it), with the server's default login theme and with its older `keycloak` login
theme, and runs the whole suite against it twice on every push and pull request, then the assertions that
must fail; see [`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, Python 3, and Node.js 20 or later with
npm. The sign-in server runs in its container: no Java on the machine, no public domain and no account
anywhere. The server needs about 850 MB of memory once it runs.

**1. The site.** The pack's own build script (the one CI runs) makes a DDEV project with the sign-in
server (Keycloak 26.8.2, its official container, in development mode) under `/auth`, the realm it imports
from the pack's own file (`site/realm/webship-realm.json`), the accounts of [Test users](#test-users),
and a small test app at the root that sends a person to the server to sign in and shows who is signed in.
It takes about a minute the first time (the server's image is about 470 MB).

```bash
git clone https://github.com/webship/keycloak-steps.git
SITE_DIR="$PWD/keycloak-site" keycloak-steps/.github/scripts/build-ddev-site.sh
```

The app answers at `https://keycloaksteps.ddev.site`, the server at
`https://keycloaksteps.ddev.site/auth` and the mail catcher at `https://keycloaksteps.ddev.site:8026`.
The accounts are `administrator`, `editor`, `user` and `otpuser`, each with the password `dD.123123ddd`;
`otpuser` has a one-time code set up (step 3 names its key).

In the [Webship Workspace](https://github.com/webship/workspace), its Keycloak plugin builds the same
site instead, in a sites folder of the workspace (`dev/` here, the one `--with-needs` adds to a new
workspace; `test/`, `sandboxes/` and `demos/` work the same):

```bash
bash core/scripts/plugins.sh --require keycloak --with-needs
bash core/scripts/plugins.sh --activate keycloak --with-needs
bash core/scripts/plugins.sh --install keycloak
bash dev/cmd-keycloak-project.sh kcsite --install --add-users
```

That site answers at `https://kcsite.ddev.site` (the server at `/auth`, the mail at `:8026`). Its realm
is the same file, and its accounts are the plugin's: the same four, with the workspace's shared password
`dD.123123ddd` and the same key for `otpuser`. The workspace's own account is the admin of the server's
master realm; the suite does not use it. The plugin's README says how to manage the accounts with its
admin tool (`cmd-tools-keycloak-admin.sh kcsite --add-users`).

**2. A test project.**

```bash
mkdir keycloak-tests && cd keycloak-tests
npm init -y
npm install --save-dev webship-js @webship-js/keycloak-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first
feature and the `npm test` scripts, and installs Chromium. npm usually runs it already when it installs
webship-js; a second run changes nothing. Its first feature opens the app's home page: it passes, and can
stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step files of webship-js and of
the pack, the tags that keep the assertions that must fail out of a normal run, the addresses of the app,
the sign-in server (with its realm) and the mail catcher, how the app starts a sign-in, the account the
test-data steps work as, the browser messages that are no error of the site, and the accounts (the JSON of
[Test users](#test-users)). The first lines are the starter's own: a feature named on the command line runs
alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

// The app; the sign-in server and the mail catcher are where the test site lays them out.
const launchUrl = (process.env.LAUNCH_URL || 'https://keycloaksteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/keycloak-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // The sign-in server (its address with its path) and the realm the app signs in with.
      signInServer: { url: `${launchUrl}/auth`, realm: 'webship' },
      // The page of the app that starts a sign-in, and its sign-in button.
      appSignIn: { path: '/', button: 'Sign in' },
      // The mail catcher the server sends its mail to.
      mailUrl: `${launchUrl}:8026`,
      // The account the test-data steps work as, through the server's admin REST API (a realm admin of `users`).
      dataAdmin: 'administrator',
      // No error of the site: a request lost when the network of the machine changed.
      javascript: { mode: 'warn', levels: ['error'], ignore: 'net::ERR_NETWORK_CHANGED', beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { username: 'administrator', email: 'administrator@example.com', password: 'dD.123123ddd' },
        editor: { username: 'editor', email: 'editor@example.com', password: 'dD.123123ddd' },
        user: { username: 'user', email: 'user@example.com', password: 'dD.123123ddd' },
        otpuser: { username: 'otpuser', email: 'otpuser@example.com', password: 'dD.123123ddd', otpSecret: 'O5SWE43INFYHIZLTORXXI4DTMVRXEZLU' },
      },
    },
  },
};
```

On the site from the Webship Workspace (step 1) the accounts are the same; its address goes in
`LAUNCH_URL` (step 5), and the server and the mail catcher follow it.

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: The user logs in through the login form and is back in the app
    Given I am not logged in
    When I log in as "user" with the login form
    Then I should be back in the app
    And I should be logged in as "user"

  Scenario: The account with a one-time code types the code its key gives
    Given I am not logged in
    When I submit the login form as "otpuser"
    Then I should be asked for a one-time code
    When I enter the one-time code of "otpuser"
    Then I should be logged in as "otpuser"
```

**5. Run it.** Set `LAUNCH_URL` to the address of the app: `https://keycloaksteps.ddev.site` for the
build script's site, `https://kcsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://keycloaksteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and the starter's, passed)
and the HTML report it wrote:

```
@@FIRST_RUN_OUTPUT@@
```

One feature runs alone when the command line names it (a scenario too, with its line):

```bash
LAUNCH_URL=https://keycloaksteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they also ship in the package,
under `node_modules/@webship-js/keycloak-steps/tests/features/`). Together they use every step of the
pack. They run as they are on the site of either way of step 1: what a scenario changes on an account is
put back after it.

For your own app, point `launchUrl` at it, `signInServer` at its server and realm, `appSignIn` at the page
and the button that start its sign-in (`button: ''` for an app that sends every visitor to sign in by
itself), `mailUrl` at the mail catcher the server sends to, and `users` at the test accounts of its realm
(`otpSecret` for one with a code: the key an authenticator app is given). The steps that read the server's
pages work on any app; the test app's own words (`Signed in to Webship test app as user.`) are read with
webship-js's `I should see "…"`.

### What the suite tests

The features of this repository run every step of the pack against the test site, twice in a row in CI on
every change, then the assertions that must fail: a visitor sent to the login form; each account logging
in through the form and back in the app; a wrong password and an unknown account refused with the same
words; a login by email address; a session taken over and accounts switched; "Remember me" outliving a
closed browser and a login without it ending with it; logging out of the server, and the app's own
sign-out; the code of `otpuser` typed from its key, a wrong code refused, the login restarted, a code set up
when the server asks and signed in with; a reset link by mail, a new password chosen and signed in with, an
unknown address answered the same way with no mail sent, two new passwords that differ refused, the required
action "Update Password"; the email verified through its mail; the registration form's refusals (a taken
username and email, two passwords that differ, empty fields, a malformed address); the consent screen with
its access, yes and no, the grant listed in the account console and taken back; the error pages (an
address a client does not allow, an unknown client, a missing page) and the way back; the account console's
personal info saved and refused, its authenticators listed, set up and deleted, its device activity and
applications, its sign-out; the admin console's realm, its user search, a user's details and roles, a
password reset (also a temporary one, which the account must change at its next login), the clients and
roles, and the refusal of an account without the admin's rights.

Whatever a scenario changes on an account is put back after it through the admin REST API: its password,
its required actions, its email verified, the codes it set up, the grants it gave, its names. The suite
never makes or deletes an account.

The two scenarios that reset a password in the admin console print a JavaScript error as a warning (the
suite's `javascript` mode is `warn`): the reset-password dialog of the admin console (26.8.2) throws
`TypeError: Cannot read properties of null (reading 'value')` at every change of its "Password" field, also
when a person types in it. The reset itself works; the scenarios pass.

Not tested: the server's other languages (the steps read the words of its English pages: "Sign In",
"Forgot Password?", "Restart login", "Grant Access to", "Yes", "No"), a completed registration (a suite
never makes an account), WebAuthn and passkeys, recovery codes, identity brokering (signing in through
another provider) and linked accounts, the admin console's other pages (beyond Users, Clients and Realm
roles), and the server's REST APIs as such (webship-js's own API steps cover them).

## Requirements

- Node.js 20 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Keycloak server (26.x) with a realm the app signs in with, and accounts for the suite (a realm admin
  among them, for the test-data steps)

## Install

```bash
npm install --save-dev @webship-js/keycloak-steps
```

## How the steps find things and wait

- **By what a person reads.** A field by the label over it, a button and a link by their words, a page of
  the consoles by its navigation item, an app by its name, an account by a handle of the users registry
  (its username on the server). The server's stable hooks are the fallback: the login themes' form ids
  (`#kc-form-login`, `#kc-otp-login-form`), their field ids (`#username`, `#otp`, `#totp`, `#userLabel`)
  and the error under a field (`#input-error-<field>`). The "Mobile Authenticator Setup" page of the default
  login theme labels its two fields for an element that does not exist, so they have no accessible name:
  the steps find them by their label's form group, then by their ids.
- **The server's own signals, no fixed sleeps.** The login pages are rendered by the server: an action is a
  form POST and a full page load, and the steps wait for the new page and read which page of the flow it is
  (the login form, the one-time code, a required action, the consent, an error). The consoles are
  single-page apps: they sign in silently, then ask the server's REST API for each page behind a spinner;
  the steps wait for the page's own request to answer (`/admin/realms/<realm>/clients`, `/account/credentials`)
  and for the spinner to go. An app decides whether the browser is signed in in a hidden frame before it
  shows its sign-in button or the account: the steps wait for the app to settle (no request, no timer, no
  change of the page for a moment) before they read it.
- **Long timers.** The consoles keep timers that fire seconds or minutes later (the 5-second check of the
  login state, the renewal of the token). webship-js's settle counts every pending timer as work in
  progress; the pack takes timers of five seconds or more out of that count.
- **Who is signed in** is asked of the server itself, the way a silent sign-in check does it (an
  authorization request with `prompt=none` for the realm's account console, with the browser's own cookies),
  without touching the page.
- **One-time codes** are worked out from the account's key (RFC 6238: HMAC-SHA1, 6 digits, 30 seconds, or
  the settings the set-up page shows). The server takes a code once, so a second sign-in in the same
  30-second window waits for the next window, as a person with an authenticator app does: the only wait on
  the clock, and it is the protocol's.
- **Mail** is read from the mail catcher's API (Mailpit): only the mail that came since the scenario began
  or since the step that asked for it.
- **A cut request says so.** When the browser lost a request (a network change on the machine, another
  container starting), the step says the request was cut before the site answered, with a hint to run the
  scenario again (or to run the suite in the project's container), instead of blaming the scenario.
- **Failures say what was found.** `The browser is signed in as user, not as editor ("editor").`,
  `The page does not show "Your code has expired.". It shows "Invalid authenticator code.".`, with a hint
  on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list the ones the realm has in
`worldParameters.users`, by a handle the scenarios use, each with its `username` (the server logs in with
it, or with the email), its `email`, its `password`, and `otpSecret` for an account with a one-time code (its
key in base32, as an authenticator app is given it). `worldParameters.dataAdmin` names the handle of a realm
admin (realm-management: realm-admin) without a one-time code: the test-data steps and the clean-up work as it,
through the realm's `admin-cli` client and the admin REST API, in sessions of their own (the browser's session
is never touched).

An account that signed in once keeps its session for the rest of the run (`reuseSessions: false` turns it
off); a logout ends it. A password a scenario gives an account (a reset, a required action) is used by the
scenario's later steps, and the registry's password comes back after it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in
`worldParameters.users` (the default values; the `<HANDLE>_USERNAME`, `<HANDLE>_EMAIL`, `<HANDLE>_PASSWORD`
and `<HANDLE>_OTP_SECRET` variables replace them). The build script creates them; the Workspace's Keycloak
plugin creates the same four.

```json
{
  "administrator": { "username": "administrator", "email": "administrator@example.com", "password": "dD.123123ddd" },
  "editor": { "username": "editor", "email": "editor@example.com", "password": "dD.123123ddd" },
  "user": { "username": "user", "email": "user@example.com", "password": "dD.123123ddd" },
  "otpuser": { "username": "otpuser", "email": "otpuser@example.com", "password": "dD.123123ddd", "otpSecret": "O5SWE43INFYHIZLTORXXI4DTMVRXEZLU" }
}
```

`administrator` is the realm's admin (the client role `realm-admin` of `realm-management`): the admin console,
and the test-data steps work as it. `editor` has the realm role `editor`. `user` has no role of its own: the
required actions, the consent and the account console. `otpuser` has a one-time code set up ("Test phone"),
whose key is `otpSecret`. They are placeholder credentials of a throwaway test site, not of any real one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the site the suite of this
repository runs against:

- a generic DDEV project whose web server (nginx) serves the test app from `app/` and sends `/auth/` to the
  sign-in server (so the router of DDEV needs no port of its own for it), with no database of DDEV's own
  (the server keeps its data in its own file database, in a volume of the project, which `ddev delete`
  removes) and the project's mail catcher (Mailpit), which the server sends its mail to;
- the sign-in server, `quay.io/keycloak/keycloak` at `KEYCLOAK_VERSION` (26.8.2 by default), in
  development mode as a service of the project, under `/auth` (`KC_HTTP_RELATIVE_PATH`), with its address
  set (`KC_HOSTNAME`), the headers of the web server trusted, its heap limited to 768 MB, and the realm it
  imports at its first start: [`site/realm/webship-realm.json`](site/realm/webship-realm.json), the realm
  `webship` ("Webship test sign-in": registration, "Forgot password" and "Remember me" on, one-time codes of
  30 seconds that are taken once, the mail to the mail catcher), its realm role `editor` and its two clients,
  `webship-app` (the test app) and `webship-partner` (the same app at `/partner/`, with consent required);
  `LOGIN_THEME` sets the realm's login theme (the server's default when empty);
- the test app, [`site/app/`](site/app/): a page of the pack's own with the official JavaScript adapter,
  `keycloak-js` (Apache-2.0), installed from npm in the web container; it checks the sign-in silently, shows
  the account (username, name, email, roles), and sends a person to the server to sign in, register, manage
  their account or sign out;
- the server's temporary admin of its first start replaced with a permanent admin of the master realm
  (`BUILD_ADMIN`, for the build only), then the accounts of [Test users](#test-users), written with
  [`site/keycloak-site.sh`](site/keycloak-site.sh), run by bash in the server's container with the server's
  own admin CLI (`kcadm.sh`): the same script the Webship Workspace's Keycloak plugin runs. No password is on
  a command line or in a file of the project.

Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script gives the accounts back their
email, names, password, roles and one-time code.

## Steps

### `keycloak-session.steps.js` (16)

- `Given I am a logged in user with the "user" user`
- `Given I am not logged in`
- `Given I am on the login page`
- `When I go to the login page`
- `When I log in as "user" with the login form`
- `When I submit the login form as "otpuser"`
- `When I log in with the username "user" and the password "Wrong-password-1"`
- `Then the login should be refused with "Invalid username or password."`
- `When I log out`
- `Then I should be logged in`
- `Then I should not be logged in`
- `Then I should be on the login page`
- `Then I should be back in the app`
- `When I close the browser and open it again`
- `Then the sign-in should be remembered`
- `When I restart the login`

### `keycloak-one-time-code.steps.js` (6)

- `Then I should be asked for a one-time code`
- `When I enter the one-time code of "otpuser"`
- `When I enter the one-time code "123456"`
- `Then the one-time code should be refused with "Invalid authenticator code."`
- `Then I should be asked to set up a one-time code`
- `When I set up a one-time code named "Test laptop"`

### `keycloak-account-pages.steps.js` (9)

- `When I ask for a password reset link for "user"`
- `Then I should see the status message "You should receive an email shortly with further instructions."`
- `Then I should be asked to update my password`
- `When I choose a new password`
- `When I choose the new password "Webship-New-Pass-1" confirmed as "Webship-Other-Pass-2"`
- `Then I should be asked to verify my email`
- `When I try to register with:`
- `Then the "Username" field should have the error "Username already exists."`
- `Then the "Username" field should have no error`

### `keycloak-mail.steps.js` (4)

- `Then an email with the subject "Reset password" should be sent to "user"`
- `Then no email should be sent to "nobody@example.com"`
- `Then the email with the subject "Reset password" to "user" should contain "This link and code will expire within 5 minutes."`
- `When I open the "Link to reset credentials" link of the email to "user"`

### `keycloak-consent.steps.js` (3)

- `Then I should be asked to grant access to "Webship partner app"`
- `Then the consent screen should ask for "Email address"`
- `When I grant access`

### `keycloak-error-pages.steps.js` (3)

- `When I start a sign-in for the client "webship-app" with the redirect "https://wrong.example.org/"`
- `Then I should see the error page "Invalid parameter: redirect_uri"`
- `When I go back to the application`

### `keycloak-account-console.steps.js` (15)

- `When I go to the account console`
- `When I open "Signing in" in the account console`
- `Then I should be on the "Signing in" page of the account console`
- `Then the personal info should show "user@example.com" as "Email"`
- `When I set my "First name" to "Webship tester" in the personal info`
- `When I save my personal info`
- `Then I should see the success notification "Your account has been updated."`
- `Then the signing-in page should list the authenticator "Test phone"`
- `When I start setting up an authenticator in the account console`
- `When I delete the authenticator "Second phone" in the account console`
- `Then the device activity should show the current session with "Webship test app"`
- `Then the applications should list "Webship partner app" as "Third-party"`
- `Then "Webship partner app" should have access to "Email address"`
- `When I remove the access of "Webship partner app" in the account console`
- `When I sign out of the account console`

### `keycloak-admin-console.steps.js` (12)

- `When I go to the admin console`
- `Then I should not be allowed into the admin console`
- `Then the admin console should show the realm "Webship test sign-in"`
- `When I open "Users" in the admin console`
- `When I search the users for "user"`
- `Then the user list should show "user"`
- `When I open the user "user" in the admin console`
- `When I open the "Credentials" tab`
- `When I reset the password of "user" in the admin console`
- `Then the user's details should show "editor@example.com" as "Email"`
- `Then the user should have the role "editor"`
- `Then the realm should have the client "webship-app"`

### `keycloak-data.steps.js` (2)

- `Given the account "user" must update its password`
- `Given "user" has not granted access to "Webship partner app"`

Text, links, buttons, cookies and the accessibility checks are webship-js's own steps (`I should see "…"`,
`I press "Sign out"`, `a cookie with the name "…" should exist`); this pack adds what the sign-in server
decides.

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads the same on every system (one
`cucumber.js` profile per system; the platform packs are not meant to be loaded together). Loaded beside
each of the 33 published packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "user" user` | codeigniter, discourse, django, django-cms, drupal-core, joomla, laravel, mediawiki, moodle, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I log out`, `I should be logged in`, `I should be logged in as "user"`, `I should not be logged in` | backdrop-cms, codeigniter, discourse, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I log in as "user" with the login form` | codeigniter, discourse, django, laravel, mediawiki, moodle, nextjs, payload, strapi, symfony |
| `I am not logged in` | discourse, django, django-cms, drupal-core, joomla, odoo, payload, strapi, typo3, wordpress |
| `the login should be refused with "…"` | discourse, django, mediawiki, payload, strapi |
| `I am on the login page` | django-cms, drupal-core, joomla, odoo, wordpress |
| `I should see the notification "…"` | ghost, payload, prestashop, strapi, typo3 |
| `an email with the subject "…" should be sent to "…"`, `no email should be sent to "…"`, `the email with the subject "…" to "…" should contain "…"` | codeigniter, laravel, symfony, woocommerce |
| `I open the "…" link of the email to "…"` | codeigniter, laravel, symfony |
| `I should see the success notification "…"`, `the "…" field should have the error "…"` | craft-cms, laravel, odoo, symfony |
| `I log in with the username "…" and the password "…"` | discourse, moodle, symfony |
| `I open the "…" tab` | joomla, odoo, payload |
| `I should be on the login page` | discourse, wordpress |
| `I should see the status message "…"` | drupal-core, laravel |
| `the "…" field should have no error` | laravel, symfony |
| `I go to the login page` | django-cms |
| `I ask for a password reset link for "…"` | laravel |

None matches a webship-js step, and none matches a phrase of the component pack (Bootstrap) or of the Diffy
pack, which can be loaded beside this one.

An app that signs in here often has a pack of its own (a Drupal site, a WordPress site): its suite and the
sign-in features then go in two `cucumber.js` profiles, one per pack, because both packs answer the session
phrases (`npx cucumber-js -p sign-in tests/sign-in/` for the second, with `paths` and `require` of its own).

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../keycloak-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local site in the browser first: each page
it touches was opened as the account the step works as, its roles, labels and messages noted, and the signal
it gives while it loads or saves found (the page load of a form, the request a console sends for its page,
the spinner, the alert). The failures of the first runs went back to the browser before the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Keycloak logo in this README comes from Simple Icons 16.37.0, filled with the colour the set lists for
the brand. Unlike most of the set, Simple Icons marks this icon as under the Linux Foundation's trademark
usage guidelines rather than CC0-1.0; it is used here only to name the platform these steps work with. The
Keycloak name and logo are trademarks of their owner; this pack is not affiliated with or endorsed by them.
