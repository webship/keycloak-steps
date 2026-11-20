@password
Feature: Forgotten passwords and new passwords
  As a person who forgot their password, or whose password must change
  I want the server to mail me a link and let me choose a new password
  So that I can sign in again

  @critical
  Scenario: A password reset link comes by mail and sets a new password
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then I should see the status message "You should receive an email shortly with further instructions."
    And an email with the subject "Reset password" should be sent to "user"
    And the email with the subject "Reset password" to "user" should contain "This link and code will expire within 5 minutes."
    When I open the "Link to reset credentials" link of the email to "user"
    Then I should be asked to update my password
    When I choose a new password
    Then I should be back in the app
    And I should be logged in as "user"

  Scenario: The new password signs the account in after a logout
    Given I am not logged in
    When I ask for a password reset link for "user"
    And I open the "Link to reset credentials" link of the email to "user"
    And I choose a new password
    And I log out
    And I log in as "user" with the login form
    Then I should be back in the app
    And I should be logged in as "user"

  Scenario: The server answers an unknown address the same way, and sends nothing
    Given I am not logged in
    When I ask for a password reset link for "nobody@example.com"
    Then I should see the status message "You should receive an email shortly with further instructions."
    And no email should be sent to "nobody@example.com"

  Scenario: Two passwords that differ are refused
    Given I am not logged in
    When I ask for a password reset link for "user"
    And I open the "Link to reset credentials" link of the email to "user"
    And I choose the new password "Webship-New-Pass-1" confirmed as "Webship-Other-Pass-2"
    Then the "Confirm password" field should have the error "Passwords don't match."
    And I should be asked to update my password

  Scenario: The server asks for a new password at the login when the account must change it
    Given the account "editor" must update its password
    And I am not logged in
    When I log in as "editor" with the login form
    Then I should be asked to update my password
    And I should see "Update password"
    When I choose a new password
    Then I should be back in the app
    And I should see "Signed in to Webship test app as editor."
