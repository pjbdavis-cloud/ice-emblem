# Testing Framework Tracker

This file tracks which automated testing layer catches useful problems in the project.

## Goal

We want to compare the real value of:

- Rules tests (`Vitest`)
- Interaction tests (`Vitest` + React Testing Library + `jest-dom`)
- Browser E2E tests (`Playwright`)

The point is not to count raw failures. The point is to track when a test suite catches a real bug or regression early enough to save manual debugging or playtesting.

## How To Log A Catch

Add an entry when all of these are true:

- the problem was real
- the test failed before or while implementing a change
- the failure helped identify or prevent the issue

Do not log:

- a bad test fixture
- a wrong expectation in the test
- an issue already found manually before the test added value

## Log Format

| Date | Area | Bug / Regression | Caught By | Prevented Manual Iteration? | Notes |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | movement / combat / UI / animation | short description | Rules / RTL / Playwright | yes / partial / no | brief summary |

## Current Test Surface

### Rules

- movement through allies but blocked final destination
- shortest valid pathing
- zig-zag shortest-path preference
- lethal first hit prevents retaliation
- injury-threshold damage behavior
- ranged counter restrictions
- enemy target choice
- enemy movement toward nearest player
- phase rollover and action reset

### Interaction

- select / deselect
- stage move
- cancel hierarchy with `Escape`
- hover and selected panels stay separate

### Playwright MVP

- select / deselect on the real canvas
- stage and cancel a move through browser interaction
- hover updates the hover panel while selected panel stays stable

## Logged Catches

No confirmed framework-caught regressions logged yet.
