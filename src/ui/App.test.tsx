import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./components/BattleScreen", () => ({
  BattleScreen: () => <div>Battle Screen</div>,
}));

describe("App routing", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the game info wiki for /game-info routes", () => {
    window.history.pushState({}, "", "/game-info/classes");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Game Info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classes" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Disciplines" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Lumberjack" }).length).toBeGreaterThan(0);
  });

  it("renders a character detail route inside the wiki", () => {
    window.history.pushState({}, "", "/game-info/characters/player-lord");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Aster" })).toBeInTheDocument();
    expect(screen.getAllByText("Journeyman").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Proficiencies" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Items" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "*Iron Sword" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Journeyman" })).toBeInTheDocument();
  });
});
