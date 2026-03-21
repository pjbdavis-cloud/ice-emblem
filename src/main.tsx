import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { replaceRuntimeState, resetDemoState } from "./app/slices/gameSlice";
import { App } from "./ui/App";
import { store } from "./app/store";
import type { RuntimeGameState } from "./game/types";
import "./ui/styles.css";

if (import.meta.env.DEV) {
  (
    window as typeof window & {
      __ICE_EMBLEM_TEST_API__?: {
        getRuntimeState: () => RuntimeGameState;
        replaceRuntimeState: (runtime: RuntimeGameState) => void;
        resetDemoState: () => void;
      };
    }
  ).__ICE_EMBLEM_TEST_API__ = {
    getRuntimeState: () => store.getState().game.runtime,
    replaceRuntimeState: (runtime) => store.dispatch(replaceRuntimeState(runtime)),
    resetDemoState: () => store.dispatch(resetDemoState()),
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
