# Technical Architecture

## Goal
Create a React and TypeScript web app where Redux owns runtime game state, while a standalone engine layer owns the tactical rules.

## Layered Structure

### `src/game`
Pure gameplay logic with no React dependencies.

- `types.ts`
  Shared domain types for maps, units, weapons, actions, combat previews, and runtime state.
- `core/`
  Turn flow, action application, state transitions, undo, objective checks, and future pathfinding.
- `combat/`
  Damage formulas, triangle logic, range checks, and previews.
- `data/`
  JSON-like definitions for maps, classes, and weapons.
- Future folders:
  - `ai/`
  - `progression/`
  - `objectives/`
  - `editor/`

### `src/app`
Redux integration and app-level wiring.

- `store.ts`
  Configures Redux store and root reducer.
- `slices/gameSlice.ts`
  Holds runtime state and dispatches gameplay actions through the engine.
- `hooks.ts`
  Typed React-Redux hooks.

### `src/ui`
React presentation layer.

- Reads state from Redux selectors.
- Dispatches typed game actions.
- Never computes core battle rules directly.
- Responsible for layout, rendering, menus, interaction, and future animation timing.

## Data Flow
1. A UI component dispatches a game action.
2. The Redux slice forwards that action to the engine.
3. The engine returns the next runtime state.
4. React re-renders from Redux state.

## Why Redux Fits This Project
- Runtime state is shared across the map, side panels, menus, forecasts, objectives, and editor tools.
- Undo support benefits from predictable action-based updates.
- AI simulation and combat previews work better when the game state shape is explicit and centralized.
- Redux Toolkit keeps the state layer organized while still allowing pure engine functions.

## Early Design Constraints
- Engine functions should stay deterministic.
- Action handlers should be pure and serializable.
- Rules should be configurable instead of hardcoded where practical.
- React components should ask the engine for derived information rather than recomputing rules ad hoc.

## Immediate Next Targets
1. Add legal movement generation instead of free tile teleporting.
2. Gate attacks by actual reachable targets and valid range.
3. Add objectives and defeat checks to runtime state.
4. Introduce basic enemy AI turn resolution.
5. Move demo data to JSON files or content modules for easier editing.
