@account-console
Feature: The account console
  As a person with an account
  I want to see and change my account, my ways to sign in, my devices and my apps
  So that I keep my account in order myself

  @critical
  Scenario: The account console shows the personal info of the account signed in
    Given I am a logged in user with the "user" user
    When I go to the account console
    Then I should be on the "Personal info" page of the account console
    And the personal info should show "user" as "Username"
    And the personal info should show "user@example.com" as "Email"
    And the personal info should show "User" as "First name"
    And the personal info should show "Webship" as "Last name"

  Scenario: A new first name is saved
    Given I am a logged in user with the "user" user
    When I go to the account console
    And I set my "First name" to "Webship tester" in the personal info
    And I save my personal info
    Then I should see the success notification "Your account has been updated."
    And the personal info should show "Webship tester" as "First name"

  # The browser logs the refused save (400).
  @js-off
  Scenario: An empty first name is refused
    Given I am a logged in user with the "user" user
    When I go to the account console
    And I set my "First name" to "" in the personal info
    And I save my personal info
    Then the "First name" field should have the error "Please specify 'First name'."

  Scenario: The signing-in page lists the account's authenticator
    Given I am a logged in user with the "otpuser" user
    When I go to the account console
    And I open "Signing in" in the account console
    Then I should be on the "Signing in" page of the account console
    And the signing-in page should list the authenticator "Test phone"
    And I should see "Two-factor authentication"

  Scenario: An authenticator set up from the console, then deleted there
    Given I am a logged in user with the "user" user
    When I go to the account console
    And I open "Signing in" in the account console
    Then I should see "Authenticator application is not set up."
    When I start setting up an authenticator in the account console
    And I set up a one-time code named "Second phone"
    Then I should be on the "Signing in" page of the account console
    And the signing-in page should list the authenticator "Second phone"
    When I delete the authenticator "Second phone" in the account console
    Then the signing-in page should not list the authenticator "Second phone"

  Scenario: The device activity shows the session the app signed in with
    Given I am a logged in user with the "editor" user
    When I go to the account console
    And I open "Device activity" in the account console
    Then I should be on the "Device activity" page of the account console
    And the device activity should show the current session with "Webship test app"
    And the device activity should show the current session with "Account Console"

  Scenario: The applications page lists the apps the account uses
    Given I am a logged in user with the "editor" user
    When I go to the account console
    And I open "Applications" in the account console
    Then the applications should list "Webship test app" as "Internal"
    And the applications should list "Account Console"

  Scenario: Signing out of the account console ends the session
    Given I am a logged in user with the "editor" user
    When I go to the account console
    And I sign out of the account console
    Then I should be on the login page
    And I should not be logged in
