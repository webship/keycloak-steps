@must-fail
Feature: Assertions about the account console and the admin console that must fail
  Each scenario asserts something that is not true on the test site and must fail at its last step, with the
  message its description announces and a hint. They only read: the site stays as it was.

  Scenario: The account console shows another page
    Fails with: The account console shows "Personal info", not "Device activity".
    Given I am a logged in user with the "user" user
    When I go to the account console
    Then I should be on the "Device activity" page of the account console

  Scenario: The personal info holds another email
    Fails with: The personal info shows "user@example.com" as "Email", not "someone@example.org".
    Given I am a logged in user with the "user" user
    When I go to the account console
    Then the personal info should show "someone@example.org" as "Email"

  Scenario: An authenticator the account does not have
    Fails with: The signing-in page does not list the authenticator "No such phone". It lists "Test phone".
    Given I am a logged in user with the "otpuser" user
    When I go to the account console
    And I open "Signing in" in the account console
    Then the signing-in page should list the authenticator "No such phone"

  Scenario: An app of another type
    Fails with: The applications page does not list "Webship test app" as "Third-party".
    Given I am a logged in user with the "editor" user
    When I go to the account console
    And I open "Applications" in the account console
    Then the applications should list "Webship test app" as "Third-party"

  Scenario: A user the search does not find
    Fails with: The user list does not show "nobody-at-all".
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I search the users for "otp"
    Then the user list should show "nobody-at-all"

  Scenario: A client the realm does not have
    Fails with: The realm has no client "no-such-client"
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    Then the realm should have the client "no-such-client"

  Scenario: A role the user does not have
    Fails with: The user has the roles
    Given I am a logged in user with the "administrator" user
    When I go to the admin console
    And I open the user "editor" in the admin console
    Then the user should have the role "admin"

  # The browser logs the console's refused request (403).
  @js-off
  Scenario: An account without admin rights does not see the realm
    Fails with: The admin console says: "You do not have permission to access this resource".
    Given I am a logged in user with the "user" user
    When I go to the admin console
    Then the admin console should show the realm "Webship test sign-in"
