@session
Feature: Signing in to the app through the sign-in server
  As a person who uses the app
  I want the app to send me to the sign-in server and back
  So that one login gives me the app, and a logout ends it everywhere

  @critical
  Scenario: A visitor of the app is sent to the login form
    Given I am not logged in
    Then I should see "You are not signed in to Webship test app."
    When I go to the login page
    Then I should be on the login page
    And I should see "Sign in to your account"
    And I should not be logged in

  @critical
  Scenario Outline: The <account> account logs in through the login form and is back in the app
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be back in the app
    And I should see "Signed in to Webship test app as <account>."
    And I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | editor        |
      | user          |

  Scenario: The app shows the roles the account has
    Given I am a logged in user with the "editor" user
    Then I should see "Signed in to Webship test app as editor."
    And I should see "editor@example.com"
    And I should see "Editor Webship"

  Scenario: A wrong password is refused, and the username is kept
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid username or password."
    And the "Username or email" field should have the error "Invalid username or password."
    And I should not be logged in

  Scenario: An unknown account is refused with the same words
    Given I am on the login page
    When I log in with the username "nobody-at-all" and the password "Some-password-1"
    Then the login should be refused with "Invalid username or password."

  Scenario: The account logs in with its email address
    Given I am on the login page
    When I log in with the username "user@example.com" and the password "dD.123123ddd"
    Then I should be back in the app
    And I should be logged in as "user"

  Scenario: A session taken over from earlier in the run
    Given I am a logged in user with the "user" user
    And I am not logged in
    When I am a logged in user with the "user" user
    Then I should see "Signed in to Webship test app as user."
    And I should be logged in as "user"

  Scenario: Switching accounts
    Given I am a logged in user with the "user" user
    When I am a logged in user with the "editor" user
    Then I should be logged in as "editor"
    And I should see "Signed in to Webship test app as editor."

  Scenario: A login with "Remember me" outlives the browser
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me" checked
    Then I should be back in the app
    And the sign-in should be remembered
    When I close the browser and open it again
    Then I should be logged in as "user"
    And I should see "Signed in to Webship test app as user."

  Scenario: A login without "Remember me" ends with the browser
    Given I am not logged in
    When I log in as "user" with the login form
    Then the sign-in should not be remembered
    When I close the browser and open it again
    Then I should not be logged in
    And I should see "You are not signed in to Webship test app."

  Scenario: Logging out of the server signs the app out
    Given I am a logged in user with the "user" user
    When I log out
    Then I should not be logged in
    And I should see "You are logged out"
    When I go to "/"
    Then I should see "You are not signed in to Webship test app."

  Scenario: The app's own sign-out ends the session at the server
    Given I am not logged in
    When I log in as "editor" with the login form
    And I press "Sign out"
    Then I should see "You are not signed in to Webship test app."
    And I should not be logged in
