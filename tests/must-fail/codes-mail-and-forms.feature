@must-fail
Feature: Assertions about codes, mail, forms and consent that must fail
  Each scenario asserts something that is not true on the test site and must fail at its last step, with the
  message its description announces and a hint. They only read: the site stays as it was.

  Scenario: An account without a code is not asked for one
    Fails with: The sign-in server does not show its one-time code page
    Given I am not logged in
    When I submit the login form as "user"
    Then I should be asked for a one-time code

  Scenario: A wrong code is refused with other words
    Fails with: The page does not show "Your code has expired."
    Given I am not logged in
    When I submit the login form as "otpuser"
    And I enter the one-time code "000000"
    Then the one-time code should be refused with "Your code has expired."

  Scenario: No mail came to an account nobody asked a reset for
    Fails with: No mail "Reset password" came to editor@example.com
    Given I am not logged in
    Then an email with the subject "Reset password" should be sent to "editor"

  Scenario: The reset mail does not say what it does not say
    Fails with: does not say "This link never expires."
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then the email with the subject "Reset password" to "user" should contain "This link never expires."

  Scenario: A field's error is not another field's
    Fails with: The "Email" field does not show the error "Username already exists."
    Given I am not logged in
    When I try to register with:
      | Username         | user             |
      | Password         | Some-password-1  |
      | Confirm password | Some-password-1  |
      | Email            | user@example.com |
      | First name       | Taken            |
      | Last name        | Account          |
    Then the "Email" field should have the error "Username already exists."

  Scenario: The app of the site asks for no consent
    Fails with: The sign-in server does not show its consent page
    Given I am not logged in
    When I log in as "user" with the login form
    Then I should be asked to grant access to "Webship partner app"
