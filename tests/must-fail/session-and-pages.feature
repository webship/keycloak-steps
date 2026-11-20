@must-fail
Feature: Assertions about the session and the pages that must fail
  Each scenario asserts something that is not true on the test site and must fail at its last step, with the
  message its description announces and a hint. They only read: the site stays as it was.

  Scenario: Signed in as another account
    Fails with: The browser is signed in as user, not as editor ("editor").
    Given I am a logged in user with the "user" user
    Then I should be logged in as "editor"

  Scenario: A visitor is not signed in
    Fails with: The server does not know the browser as a signed-in account
    Given I am not logged in
    Then I should be logged in

  Scenario: A signed-in browser is not a visitor
    Fails with: The browser is still signed in as user at the server.
    Given I am a logged in user with the "user" user
    Then I should not be logged in

  Scenario: A refusal with other words
    Fails with: The login form does not show "Account is disabled, contact your administrator."
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Account is disabled, contact your administrator."

  Scenario: A login without "Remember me" is not remembered
    Fails with: The sign-in is not remembered: the server's session cookie ends with the browser.
    Given I am not logged in
    When I log in as "user" with the login form
    Then the sign-in should be remembered

  Scenario: The app is not the login form
    Fails with: The sign-in server does not show its login page
    Given I am not logged in
    Then I should be on the login page

  Scenario: The login form is not the app
    Fails with: The browser is not back in the app
    Given I am on the login page
    Then I should be back in the app

  @js-off
  Scenario: An error page with another message
    Fails with: The error page says "Invalid parameter: redirect_uri", not "Client not found."
    Given I am not logged in
    When I start a sign-in for the client "webship-app" with the redirect "https://wrong.example.org/"
    Then I should see the error page "Client not found."
