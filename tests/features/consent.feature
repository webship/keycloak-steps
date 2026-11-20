@consent
Feature: The consent screen of an app of another party
  As a person signing in to an app of another party
  I want to see what the app asks for and say yes or no
  So that no app reads my account without my consent

  Scenario: The partner app asks for consent, and a yes lets the person in
    Given "user" has not granted access to "Webship partner app"
    And I am not logged in
    When I go to "/partner/"
    And I log in as "user" with the login form
    Then I should be asked to grant access to "Webship partner app"
    And the consent screen should ask for "User profile"
    And the consent screen should ask for "Email address"
    When I grant access
    Then I should be back in the app
    And I should see "Signed in to Webship partner app as user."

  Scenario: A no sends the person back to the app with the refusal
    Given "user" has not granted access to "Webship partner app"
    And I am not logged in
    When I go to "/partner/"
    And I log in as "user" with the login form
    And I deny access
    Then I should be back in the app
    And I should see "The sign-in did not succeed"
    And I should see "You are not signed in to Webship partner app."
    And I should not be logged in

  Scenario: A grant is listed in the account console and taken back there
    Given "user" has not granted access to "Webship partner app"
    And I am not logged in
    When I go to "/partner/"
    And I log in as "user" with the login form
    And I grant access
    And I go to the account console
    And I open "Applications" in the account console
    Then the applications should list "Webship partner app" as "Third-party"
    And "Webship partner app" should have access to "Email address"
    When I remove the access of "Webship partner app" in the account console
    Then the applications should not list "Webship partner app"
