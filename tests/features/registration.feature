@registration
Feature: The registration form refuses what it must
  As the owner of the sign-in server
  I want a sign-up with a taken name, a taken address or a wrong field refused
  So that every account stays unique and complete

  # A suite never makes an account: every scenario here is a refusal.

  Scenario: A taken username and email are refused, and two passwords that differ
    Given I am not logged in
    When I try to register with:
      | Username         | user             |
      | Password         | Some-password-1  |
      | Confirm password | Other-password-2 |
      | Email            | user@example.com |
      | First name       | Taken            |
      | Last name        | Account          |
    Then the "Username" field should have the error "Username already exists."
    And the "Email" field should have the error "This email is already associated with an existing account."
    And the "Confirm password" field should have the error "Password confirmation doesn't match."

  Scenario: Empty fields and a malformed address are refused
    Given I am not logged in
    When I try to register with:
      | Username         |                |
      | Password         |                |
      | Confirm password |                |
      | Email            | not-an-address |
      | First name       |                |
      | Last name        |                |
    Then the "Username" field should have the error "Please specify username."
    And the "Password" field should have the error "Please specify password."
    And the "Email" field should have the error "Invalid email address."
    And the "First name" field should have the error "Please specify this field."
    And the "Last name" field should have the error "Please specify this field."

  Scenario: A refused field keeps what was typed, a right one shows no error
    Given I am not logged in
    When I try to register with:
      | Username         | a-new-name-for-the-suite |
      | Password         | Some-password-1          |
      | Confirm password | Some-password-1          |
      | Email            | user@example.com         |
      | First name       | New                      |
      | Last name        | Person                   |
    Then the "Email" field should have the error "This email is already associated with an existing account."
    And the "Username" field should have no error
    And the "First name" field should have no error
