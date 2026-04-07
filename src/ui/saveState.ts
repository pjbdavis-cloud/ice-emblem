import type { RuntimeGameState } from "../game/types";

export const SAVE_STORAGE_KEY = "ice-emblem.saves";
export const SAVE_SCHEMA_VERSION = 1;
export const MAX_MANUAL_SAVES = 3;
export const MAX_AUTOSAVES = 3;

export type SerializedGameState = {
  game: {
    runtime: RuntimeGameState;
  };
};

export type SaveType = "manual" | "autosave";

export type SaveEntry = {
  id: string;
  type: SaveType;
  name: string;
  savedAt: string;
  mapId: string;
  mapName: string;
  turnNumber: number;
  phase: RuntimeGameState["phase"];
  gameResult: RuntimeGameState["gameResult"];
  state: SerializedGameState;
};

export type SaveCollection = {
  version: number;
  manual: SaveEntry[];
  autosave: SaveEntry[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const fallbackStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function createSerializedGameState(runtime: RuntimeGameState): SerializedGameState {
  return {
    game: {
      runtime,
    },
  };
}

export function getEmptySaveCollection(): SaveCollection {
  return {
    version: SAVE_SCHEMA_VERSION,
    manual: [],
    autosave: [],
  };
}

export function readSaveCollection(storage: StorageLike = getStorage()): SaveCollection {
  const raw = storage.getItem(SAVE_STORAGE_KEY);
  if (!raw) {
    return getEmptySaveCollection();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSaveCollection(parsed);
  } catch {
    return getEmptySaveCollection();
  }
}

export function writeSaveCollection(
  collection: SaveCollection,
  storage: StorageLike = getStorage(),
): void {
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(collection));
}

export function createSaveEntry(type: SaveType, runtime: RuntimeGameState): SaveEntry {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: buildDefaultSaveName(type, runtime),
    savedAt: new Date().toISOString(),
    mapId: runtime.map.id,
    mapName: runtime.map.name,
    turnNumber: runtime.turnNumber,
    phase: runtime.phase,
    gameResult: runtime.gameResult,
    state: createSerializedGameState(runtime),
  };
}

export function addSaveEntry(collection: SaveCollection, entry: SaveEntry): SaveCollection {
  const key = entry.type === "autosave" ? "autosave" : "manual";
  const limit = entry.type === "autosave" ? MAX_AUTOSAVES : MAX_MANUAL_SAVES;
  const nextEntries = [entry, ...collection[key]].slice(0, limit);

  return {
    ...collection,
    version: SAVE_SCHEMA_VERSION,
    [key]: nextEntries,
  };
}

export function loadSaveEntry(
  entry: SaveEntry | undefined,
): SerializedGameState | undefined {
  if (!entry) {
    return undefined;
  }

  const state = entry.state;
  if (!state || !state.game || !state.game.runtime) {
    return undefined;
  }

  return state;
}

export function buildDefaultSaveName(type: SaveType, runtime: RuntimeGameState): string {
  const phaseLabel = `${runtime.phase.charAt(0).toUpperCase()}${runtime.phase.slice(1)} Phase`;
  const baseName = `${runtime.map.name} - Turn ${runtime.turnNumber} - ${phaseLabel}`;
  return type === "autosave" ? `Autosave - ${baseName}` : baseName;
}

export function getAllSaveEntries(collection: SaveCollection): SaveEntry[] {
  return [...collection.manual, ...collection.autosave].sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt),
  );
}

function normalizeSaveCollection(value: unknown): SaveCollection {
  if (!value || typeof value !== "object") {
    return getEmptySaveCollection();
  }

  const candidate = value as Partial<SaveCollection> & {
    saves?: unknown;
  };

  const manual = normalizeSaveEntries(candidate.manual);
  const autosave = normalizeSaveEntries(candidate.autosave);

  if (manual.length === 0 && autosave.length === 0 && Array.isArray(candidate.saves)) {
    const fallbackEntries = normalizeSaveEntries(candidate.saves);
    return {
      version: typeof candidate.version === "number" ? candidate.version : SAVE_SCHEMA_VERSION,
      manual: fallbackEntries.filter((entry) => entry.type !== "autosave").slice(0, MAX_MANUAL_SAVES),
      autosave: fallbackEntries.filter((entry) => entry.type === "autosave").slice(0, MAX_AUTOSAVES),
    };
  }

  return {
    version: typeof candidate.version === "number" ? candidate.version : SAVE_SCHEMA_VERSION,
    manual: manual.slice(0, MAX_MANUAL_SAVES),
    autosave: autosave.slice(0, MAX_AUTOSAVES),
  };
}

function normalizeSaveEntries(value: unknown): SaveEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSaveEntry)
    .filter((entry): entry is SaveEntry => Boolean(entry))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function normalizeSaveEntry(value: unknown): SaveEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<SaveEntry> & {
    runtime?: RuntimeGameState;
  };
  const rawState = normalizeSerializedState(candidate.state, candidate.runtime);
  if (!rawState) {
    return undefined;
  }

  const runtime = rawState.game.runtime;
  const type: SaveType = candidate.type === "autosave" ? "autosave" : "manual";
  const savedAt =
    typeof candidate.savedAt === "string" && candidate.savedAt.length > 0
      ? candidate.savedAt
      : new Date().toISOString();

  return {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : `${type}-${savedAt}`,
    type,
    name:
      typeof candidate.name === "string" && candidate.name.length > 0
        ? candidate.name
        : buildDefaultSaveName(type, runtime),
    savedAt,
    mapId:
      typeof candidate.mapId === "string" && candidate.mapId.length > 0
        ? candidate.mapId
        : runtime.map.id,
    mapName:
      typeof candidate.mapName === "string" && candidate.mapName.length > 0
        ? candidate.mapName
        : runtime.map.name,
    turnNumber:
      typeof candidate.turnNumber === "number" && Number.isFinite(candidate.turnNumber)
        ? candidate.turnNumber
        : runtime.turnNumber,
    phase:
      candidate.phase === "enemy" || candidate.phase === "player"
        ? candidate.phase
        : runtime.phase,
    gameResult:
      candidate.gameResult === "victory" ||
      candidate.gameResult === "defeat" ||
      candidate.gameResult === "in_progress"
        ? candidate.gameResult
        : runtime.gameResult,
    state: rawState,
  };
}

function normalizeSerializedState(
  state: unknown,
  legacyRuntime?: RuntimeGameState,
): SerializedGameState | undefined {
  if (
    state &&
    typeof state === "object" &&
    "game" in state &&
    state.game &&
    typeof state.game === "object" &&
    "runtime" in state.game &&
    state.game.runtime
  ) {
    return state as SerializedGameState;
  }

  if (legacyRuntime) {
    return createSerializedGameState(legacyRuntime);
  }

  return undefined;
}

function getStorage(): StorageLike {
  const candidate = typeof window !== "undefined" ? (window as { localStorage?: unknown }).localStorage : undefined;
  if (
    candidate &&
    typeof candidate === "object" &&
    "getItem" in candidate &&
    typeof candidate.getItem === "function" &&
    "setItem" in candidate &&
    typeof candidate.setItem === "function" &&
    "removeItem" in candidate &&
    typeof candidate.removeItem === "function"
  ) {
    return candidate as StorageLike;
  }

  return fallbackStorage;
}
