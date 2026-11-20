// A feature file, a scenario (file:line), a folder or a rerun file named on
// the command line of cucumber-js runs alone: `npx cucumber-js
// tests/features/session.feature`. cucumber-js 12 adds the paths of the
// command line to the `paths` of this file instead of using them alone, so
// `paths` is left empty when the command line names any, as in webship-js.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  // Only when cucumber-js itself runs, not when another script reads this file.
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

// The default is the local DDEV site that .github/scripts/build-ddev-site.sh builds (project
// "keycloaksteps"), never a site of somebody else: the suite logs in with the accounts below, changes their
// state for a scenario and puts it back after it. LAUNCH_URL points it at another app; the sign-in server and
// the mail catcher are found from it as the test site (and the Webship Workspace's builder) lays them out
// (<app>/auth and <app>:8026), or SIGN_IN_SERVER, SIGN_IN_REALM and MAIL_URL name them.
const launchUrl = (process.env.LAUNCH_URL || 'https://keycloaksteps.ddev.site').replace(/\/+$/, '');

// The password the build gives every account below; <HANDLE>_PASSWORD changes one.
const password = (handle) => process.env[`${handle.toUpperCase()}_PASSWORD`] || process.env.ACCOUNT_PASSWORD || 'dD.123123ddd';

module.exports = {
  default: {
    // The step timeout is webship-js's (45 s, set when it loads): WEBSHIP_STEP_TIMEOUT=<milliseconds> changes it; a `timeout` key here is ignored.
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions (auto HTML report on exit; disable: WEBSHIP_REPORT_DISABLE=1).
      'tests/step-definitions/**/*.js',                                  // The step definitions of this pack.
    ],
    // FEATURES=tests/features/a.feature,tests/features/b.feature runs a subset too.
    paths: process.env.FEATURES ? process.env.FEATURES.split(',') : (commandLinePaths().length ? [] : ['tests/features/**/*.feature']),
    // CUCUMBER_TAGS=@one-time-code runs a lane. The default leaves out work in progress and the assertions that
    // must fail (tests/check-must-fail.js runs them).
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: [
      '@cucumber/pretty-formatter',
      // REPORT_NAME=must-fail keeps the report of another run (tests/check-must-fail.js) apart.
      `json:tests/reports/${process.env.REPORT_NAME || 'cucumber_report'}.json`,
    ],
    formatOptions: {
      // Colours follow the terminal (GitHub Actions counts as one); FORCE_COLOR=1
      // or FORCE_COLOR=0 sets them. cucumber-js 12 deprecated `colorsEnabled`.
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      // The app: the test app of the build, which sends a person to the sign-in server and shows who is signed in.
      launchUrl,
      // The sign-in server: its address with its path (the test site runs it under /auth), and the realm the app
      // signs in with.
      signInServer: {
        url: process.env.SIGN_IN_SERVER || `${launchUrl}/auth`,
        realm: process.env.SIGN_IN_REALM || 'webship',
      },
      // How the app starts a sign-in: the page of the app, and its sign-in button or link ('' for an app that sends
      // every visitor to sign in by itself).
      appSignIn: {
        path: process.env.APP_SIGN_IN_PATH || '/',
        button: process.env.APP_SIGN_IN_BUTTON === undefined ? 'Sign in' : process.env.APP_SIGN_IN_BUTTON,
      },
      // The mail catcher the server sends its mail to (Mailpit): the password reset and the email verification.
      mailUrl: process.env.MAIL_URL || `${launchUrl}:8026`,
      // The account the test-data steps and the clean-up work as, through the server's admin REST API: a handle of
      // `users` with the realm's admin rights (realm-management: realm-admin), without a one-time code.
      dataAdmin: process.env.DATA_ADMIN || 'administrator',
      // The steps put back after each scenario what it changed: passwords, required actions, the email verified,
      // one-time codes set up, grants given, names. false keeps the changes.
      signInCleanUp: process.env.SIGN_IN_CLEAN_UP !== 'false',
      // An account that signed in once keeps its session for the rest of the run: later scenarios take it over
      // instead of filling in the login form again.
      reuseSessions: process.env.REUSE_SESSIONS !== 'false',
      // Video of the browser: 'off', 'on', 'on-failure' or 'tag' (scenarios tagged @video; @no-video opts out).
      video: { mode: process.env.WEBSHIP_VIDEO || 'off', dir: './videos', size: { width: 1280, height: 720 }, filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}' },
      // JavaScript errors the page raises: 'warn' reports them, 'fail' fails the scenario, 'off' ignores them;
      // @js-fail, @js-warn and @js-off per scenario. Ignored, as no error of the server or of the app:
      //   - "Failed to load resource: net::ERR_NETWORK_CHANGED": the browser lost a request when the network of the
      //     machine changed (another container starting); a step that needed it says so.
      // The scenarios of an error page or a refusal (a 400, a 403, a 404 the server answers) carry @js-off: the
      // browser logs the refused request for each of them.
      javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], ignore: 'net::ERR_NETWORK_CHANGED', beforeScenario: false, afterScenario: true },
      // The accounts that "I am a logged in user with the ... user" uses, by handle. They are configuration, not test
      // data: the build of the site creates them once (.github/scripts/build-ddev-site.sh, or the Webship
      // Workspace's builder) and a feature never creates or deletes an account. otpSecret is the key of the
      // account's one-time code, in base32 as an authenticator app is given it. Point the suite at another server
      // with the <HANDLE>_USERNAME, <HANDLE>_EMAIL, <HANDLE>_PASSWORD and <HANDLE>_OTP_SECRET variables.
      users: {
        // The realm's admin (realm-management: realm-admin): the admin console; the test-data steps work as it.
        administrator: {
          username: process.env.ADMINISTRATOR_USERNAME || 'administrator',
          email: process.env.ADMINISTRATOR_EMAIL || 'administrator@example.com',
          password: password('administrator'),
        },
        // The realm role editor.
        editor: {
          username: process.env.EDITOR_USERNAME || 'editor',
          email: process.env.EDITOR_EMAIL || 'editor@example.com',
          password: password('editor'),
        },
        // No role of its own: the required actions, the consent, the account console.
        user: {
          username: process.env.USER_USERNAME || 'user',
          email: process.env.USER_EMAIL || 'user@example.com',
          password: password('user'),
        },
        // A one-time code set up by the build: the key below gives its codes.
        otpuser: {
          username: process.env.OTPUSER_USERNAME || 'otpuser',
          email: process.env.OTPUSER_EMAIL || 'otpuser@example.com',
          password: password('otpuser'),
          otpSecret: process.env.OTPUSER_OTP_SECRET || 'O5SWE43INFYHIZLTORXXI4DTMVRXEZLU',
        },
      },
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },
      selectors: {
        css: {},
        xpath: {},
        filesPath: './tests/selectors/',
        files: [],
        offset: 60,
        breakpoints: {
          xs:   { width: 375,  height: 667  },
          sm:   { width: 576,  height: 800  },
          md:   { width: 768,  height: 1024 },
          lg:   { width: 992,  height: 768  },
          xl:   { width: 1200, height: 900, default: true },
          xxl:  { width: 1400, height: 900  },
          xxxl: { width: 1920, height: 1080 },
        },
      },
      screenshot: {
        dir: './screenshots',
        purge: false,
        onFailed: true,
        onEveryStep: false,
        alwaysFullscreen: false,
        failedPrefix: 'failed_',
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',
      },
    },
  },
};
