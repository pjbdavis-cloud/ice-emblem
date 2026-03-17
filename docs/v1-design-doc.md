# Fire Emblem-Style Web App

## Level 1: Product Vision

### Goal
Build a deterministic, turn-based tactical RPG as a web app in React, inspired by the Game Boy Advance Fire Emblem games.

### Core Pillars
- Classic grid-based tactical combat on rectangular maps.
- Predictable combat outcomes with no random hit chance or critical hits.
- Strong data-driven design so classes, units, maps, weapons, and formulas can be tuned easily.
- Simple initial feature set with room to expand into deeper terrain, progression, AI, and content systems later.

### Technical Direction
- React handles rendering, menus, input, and editor workflows.
- A standalone TypeScript game engine handles rules, combat, movement, turns, objectives, and AI.
- Game content is defined in editable JSON or TypeScript data files.

## Level 2: V1 Gameplay Rules

### Map Structure
- Maps use rectangular `N x M` grids.
- Each tile stores terrain type.
- Maps define starting positions for player, enemy, and allied units.
- Map editing should make it easy to change terrain, objectives, and initial unit placement.

### Turn Structure
- The game alternates between player phase and enemy phase.
- Each unit may act once per phase.
- A unit may move and then attack, or move and then wait.
- A unit may not attack and then move.
- Attacking ends that unit's turn.
- When all units on one side have acted, the phase ends and control passes to the other side.
- The player may undo the last 3 committed player actions.

### Movement
- Units have a movement value based on class.
- Terrain does not affect movement in v1.
- Movement and pathfinding should be built so terrain penalties can be added later.

### Combat
- Combat is deterministic.
- There are no critical hits.
- There is no probabilistic hit rate.
- Combat previews should show exact player damage and the exact enemy counter result when applicable.
- Base damage starts from:

`damage = max(minDamage, attack + weaponMight + triangleBonus + speedBonus - defense)`

- `minDamage` should be configurable.
- No double attacks in v1.
- Speed advantage increases damage instead of granting follow-up attacks.
- Speed bonus should be threshold-based and configurable.

Example default speed bonus tuning:

- `SPD +3` over target: `+1 damage`
- `SPD +5` over target: `+2 damage`
- `SPD +8` over target: `+3 damage`

### Counterattacks and Range
- All weapons are range 1 by default.
- Bows are range 2 only by default.
- Special short bows may attack at range 1 and 2.
- Spears and throwing axes may attack at range 1 and 2.
- Magic attacks at range 1 and 2.
- A defender counterattacks only if the attacker is in the defender's valid range.

### Injuries and Death
- If a unit's HP is below half of max HP, all stats are reduced by 10%.
- The reduction should be computed by rule logic, not permanently baked into stored stats.
- At game start, the player chooses:
- `Classic`: defeated units are permanently lost.
- `Casual`: defeated units return in the next map.
- Defeat of the main character or lead characters causes immediate loss.

### Classes and Promotions
- Use recognizable Fire Emblem-style class archetypes for v1.
- The system starts with two tiers of classes.
- Class names, base stats, movement, and growth rates should be easy to edit.
- The system should be structured so a third tier can be added later.

### Leveling and Experience
- Units gain EXP through combat.
- EXP should scale using:
- level difference
- promotion tier difference
- damage dealt
- damage taken
- Exact formulas should be configurable and easy to rebalance.

### Objectives
- Initial win conditions:
- Defeat all enemies
- Defeat the boss
- Initial loss conditions:
- Main character death
- Required lead-character death
- Future objectives may include defend, escape, and seize/conquer.

### Enemy AI
- Enemy AI should prioritize:
- winning the map if possible
- killing high-priority player units
- securing kills
- dealing favorable damage
- progressing toward objectives
- Enemy behavior profiles should include:
- `hold_position`
- `aggressive`
- `triggered_aggressive`
- AI may backtrack/simulate to find stronger attacks during enemy phase.

### Terrain
- Terrain exists in the map and tile model from the start.
- Terrain gameplay effects are disabled in v1.
- The engine should later support movement costs and temporary stat modifiers from terrain.

### Inventory and Equipment
- Items have no durability in v1.
- Future durability may reset per map rather than being permanent across the campaign.
- Weapons require proficiency ranks.
- Weapon ranks are: `E`, `D`, `C`, `B`, `A`, `S`.

### Weapon and Magic Relationships
- Physical weapon triangle:
- Sword beats axe
- Axe beats lance
- Lance beats sword
- Magic has 5 types:
- Water
- Fire
- Earth/Grass
- Light
- Dark
- Elemental magic triangle:
- Water beats fire
- Fire beats earth/grass
- Earth/grass beats water
- Light and dark counter each other.

### Skills
- Keep skills intentionally limited.
- Each unit may have:
- one personal skill
- one class skill
- Large class skill trees are out of scope.

## Level 3: Scope Boundaries and Build Strategy

### Explicitly Out of Scope
- Large class skill systems
- Rescue and carrying
- Marriage or support relationship combat systems
- Child units
- Battle dialogue between units
- Key inventory management for doors and chests
- Enemy plundering
- Opening doors and performing other major actions in the same turn if that complicates the core loop
- Destructible walls
- Recruiting enemy units mid-map

### Architecture Strategy
- Build the rules engine first.
- Represent gameplay as discrete actions such as move, attack, wait, end phase, and undo.
- Store enough state history to support 3-action undo.
- Keep rules separate from React UI so mechanics can change without rewriting components.
- Use data-driven definitions for maps, units, classes, weapons, and objectives.

### Recommended Build Order
1. Scaffold React + TypeScript app.
2. Define core engine types and action model.
3. Implement JSON-driven maps, units, classes, and weapons.
4. Implement turn flow, movement, and deterministic combat preview/resolution.
5. Add objectives, defeat rules, injury penalties, and classic/casual behavior.
6. Add undo support.
7. Add basic enemy AI profiles.
8. Build map UI and side panels.
9. Build a simple map editor.
10. Add progression, promotion, terrain effects, and more advanced objectives.

### Success Criteria for V1
- A player can load a map, select units, move, attack, and end turns.
- Enemy units can take complete turns with simple AI behaviors.
- Combat forecasts are deterministic and understandable.
- Objectives resolve correctly.
- Defeated units are handled correctly in classic and casual modes.
- Designers can modify maps and core data without rewriting engine code.
