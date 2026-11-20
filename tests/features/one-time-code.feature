@one-time-code
Feature: One-time codes
  As a person whose account asks for a one-time code
  I want my authenticator app's code to let me in, and a wrong one to be refused
  So that the second factor guards the account

  @critical
  Scenario: The account with a one-time code types the code its key gives
    Given I am not logged in
    When I submit the login form as "otpuser"
    Then I should be asked for a one-time code
    When I enter the one-time code of "otpuser"
    Then I should be back in the app
    And I should see "Signed in to Webship test app as otpuser."
    And I should be logged in as "otpuser"

  Scenario: The login form types the code by itself for an account with a key
    Given I am not logged in
    When I log in as "otpuser" with the login form
    Then I should be back in the app
    And I should be logged in as "otpuser"

  Scenario: A wrong code is refused and asked for again
    Given I am not logged in
    When I submit the login form as "otpuser"
    And I enter the one-time code "000000"
    Then the one-time code should be refused with "Invalid authenticator code."
    And I should be asked for a one-time code
    And I should not be logged in

  Scenario: Restarting the login forgets the username
    Given I am not logged in
    When I submit the login form as "otpuser"
    And I restart the login
    Then I should be on the login page
    And the "Username or email" field should have no error

  Scenario: The account sets a one-time code up when the server asks, then signs in with it
    Given the account "user" must set up a one-time code
    And I am not logged in
    When I log in as "user" with the login form
    Then I should be asked to set up a one-time code
    And I should see "Mobile Authenticator Setup"
    When I set up a one-time code named "Test laptop"
    Then I should be back in the app
    When I log out
    And I submit the login form as "user"
    Then I should be asked for a one-time code
    When I enter the one-time code of "user"
    Then I should be logged in as "user"

  Scenario: A wrong code on the set-up page is refused
    Given the account "user" must set up a one-time code
    And I am not logged in
    When I log in as "user" with the login form
    And I enter the one-time code "123456"
    Then the one-time code should be refused with "Invalid authenticator code."
    And I should be asked to set up a one-time code
