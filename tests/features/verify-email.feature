@verify-email
Feature: Verifying the email address
  As a person whose email address is not verified
  I want the server to mail me a link before it lets me in
  So that the account's address is known to be mine

  Scenario: The account follows the verification link of the mail and is let in
    Given the account "user" must verify its email
    And I am not logged in
    When I log in as "user" with the login form
    Then I should be asked to verify my email
    And I should see "You need to verify your email address to activate your account."
    And an email with the subject "Verify email" should be sent to "user"
    And the email with the subject "Verify email" to "user" should contain "verify your email address"
    When I open the "Link to e-mail address verification" link of the email to "user"
    Then I should be back in the app
    And I should see "Signed in to Webship test app as user."
