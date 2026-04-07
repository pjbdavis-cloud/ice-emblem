import { describe, expect, it } from "vitest";
import { addSaveEntry, buildDefaultSaveName, createSaveEntry, getEmptySaveCollection, loadSaveEntry } from "./saveState";
import { createInitialRuntimeState } from "../game/core/state";
import { demoMap } from "../game/data/demoMap";

describe("saveState", () => {
  it("labels autosaves and leaves manual saves unlabeled", () => {
    const runtime = createInitialRuntimeState(demoMap);

    expect(buildDefaultSaveName("manual", runtime)).toBe("Demo Route Skirmish - Turn 1 - Player Phase");
    expect(buildDefaultSaveName("autosave", runtime)).toBe("Autosave - Demo Route Skirmish - Turn 1 - Player Phase");
  });

  it("keeps only the newest three saves per bucket", () => {
    const runtime = createInitialRuntimeState(demoMap);
    let collection = getEmptySaveCollection();

    for (let index = 0; index < 4; index += 1) {
      collection = addSaveEntry(collection, {
        ...createSaveEntry("manual", runtime),
        id: `manual-${index}`,
        savedAt: `2026-04-06T00:00:0${index}.000Z`,
      });
    }

    expect(collection.manual).toHaveLength(3);
    expect(collection.manual.map((entry) => entry.id)).toEqual(["manual-3", "manual-2", "manual-1"]);
  });

  it("loads legacy runtime-only saves through normalization fallback", () => {
    const runtime = createInitialRuntimeState(demoMap);

    const loaded = loadSaveEntry({
      id: "legacy",
      type: "manual",
      name: "Legacy Save",
      savedAt: "2026-04-06T00:00:00.000Z",
      mapId: runtime.map.id,
      mapName: runtime.map.name,
      turnNumber: runtime.turnNumber,
      phase: runtime.phase,
      gameResult: runtime.gameResult,
      state: {
        game: {
          runtime,
        },
      },
    });

    expect(loaded?.game.runtime.map.id).toBe(runtime.map.id);
  });
});
