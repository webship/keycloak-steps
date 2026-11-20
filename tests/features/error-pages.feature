@error-pages
Feature: The sign-in server's error pages
  As the owner of an app that signs in through the server
  I want a sign-in the server must refuse to end on its error page
  So that no app sends a person to an address it was not given

  # The browser logs the server's answer (400, 404) of every error page.

  @js-off
  Scenario: An address the app's client does not allow is refused
    Given I am not logged in
    When I start a sign-in for the client "webship-app" with the redirect "https://wrong.example.org/"
    Then I should see the error page "Invalid parameter: redirect_uri"
    And I should see "We are sorry..."
    When I go back to the application
    Then I should be back in the app

  @js-off
  Scenario: A client the realm does not know is refused
    Given I am not logged in
    When I start a sign-in for the client "no-such-client"
    Then I should see the error page "Client not found."

  @js-off
  Scenario: A page the server does not have
    Given I am not logged in
    When I go to "/auth/realms/webship/no-such-page"
    Then I should see the error page "Page not found"

  Scenario: A sign-in started for the app's own client opens the login form
    Given I am not logged in
    When I start a sign-in for the client "webship-app"
    Then I should be on the login page
