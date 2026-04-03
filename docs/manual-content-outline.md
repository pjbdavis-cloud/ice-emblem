# Manual Content Outline

## Quick Path
- Add or rename classes in `src/game/data/contentSkeleton.ts`.
- Add weapons there next so unit loadouts exist before you place units.
- Copy the unit skeletons and edit names, stats, positions, and skills.
- When you are ready, move finished content into a real map file like `src/game/data/demoMap.ts`.

## Minimum Shape

### Class
- `id`
- `name`
- `tier`
- `movement`

### Weapon
- `id`
- `name`
- `category`
- `power`
- `minRange`
- `maxRange`
- `requiredRank`
- `magicType` only for magic weapons

### Unit
- `id`
- `name`
- `classId`
- `team`
- `level`
- `tier`
- `stats`
- `currentHp`
- `position`
- `inventory`
- `equippedWeaponId`

## Practical Authoring Order
1. Define classes.
2. Define weapons.
3. Define units.
4. Place units on the map.
5. Tune stats and movement.

## Animation Note
Basic movement interpolation is now handled in the canvas layer. Logical state still updates from the engine, but units visually slide to their new tile over a short duration. That means you can keep editing rules and content normally without touching the animation code.
