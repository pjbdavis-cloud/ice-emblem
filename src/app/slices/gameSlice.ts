import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  applyAction,
  canUndo,
  createInitialRuntimeState,
  processNextEnemyAction,
  undoLastAction,
} from "../../game/core/state";
import { demoMap } from "../../game/data/demoMap";
import type { GameAction, RuntimeGameState } from "../../game/types";

type GameSliceState = {
  runtime: RuntimeGameState;
};

const initialState: GameSliceState = {
  runtime: createInitialRuntimeState(demoMap),
};

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    dispatchGameAction(state, action: PayloadAction<GameAction>) {
      state.runtime = applyAction(state.runtime, action.payload);
    },
    replaceRuntimeState(state, action: PayloadAction<RuntimeGameState>) {
      state.runtime = action.payload;
    },
    undoAction(state) {
      if (!canUndo(state.runtime)) {
        return;
      }

      state.runtime = undoLastAction(state.runtime);
    },
    resetDemoState(state) {
      state.runtime = createInitialRuntimeState(demoMap);
    },
    stepEnemyPhase(state) {
      state.runtime = processNextEnemyAction(state.runtime);
    },
  },
});

export const { dispatchGameAction, replaceRuntimeState, resetDemoState, stepEnemyPhase, undoAction } =
  gameSlice.actions;
export const gameReducer = gameSlice.reducer;
