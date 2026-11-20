@admin-console
Feature: The admin console of the realm
  As the admin of the realm
  I want to find and open the accounts, reset a password and see the clients and roles
  So that I can look after the realm's accounts

  @critical
  Scenario: The realm's admin opens the admin console of the realm
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    Then the admin console should show the realm "Webship test sign-in"

  Scenario: Finding users by the start of their name
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I search the users for "otp"
    Then the user list should show "otpuser"
    And the user list should not show "user"
    When I search the users for "nobody-at-all"
    Then the user list should not show "otpuser"

  Scenario: A user's details and roles
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I open the user "editor" in the admin console
    Then the user's details should show "editor@example.com" as "Email"
    And the user should have the role "editor"
    And the user should have the role "default-roles-webship"

  Scenario: The admin resets a test account's password, and the account signs in with it
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I open the user "user" in the admin console
    And I reset the password of "user" in the admin console
    Then I should see the success notification "The password has been reset successfully."
    Given I am not logged in
    When I log in as "user" with the login form
    Then I should be back in the app
    And I should be logged in as "user"

  Scenario: A temporary password makes the account choose a new one at its next login
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I reset the password of "user" in the admin console as a temporary password
    Then I should see the success notification "The password has been reset successfully."
    Given I am not logged in
    When I log in as "user" with the login form
    Then I should be asked to update my password
    When I choose a new password
    Then I should be back in the app

  Scenario: The realm's clients and roles
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    Then the realm should have the client "webship-app"
    And the realm should have the client "webship-partner"
    And the realm should not have the client "no-such-client"
    And the realm should have the role "editor"
    And the realm should not have the role "no-such-role"

  # The browser logs the console's refused request (403).
  @js-off
  Scenario: An account without the realm's admin rights is not let in
    Given I am a logged in user with the "user" user
    When I go to the admin console
    Then I should not be allowed into the admin console
    And I should see "Sign out"
