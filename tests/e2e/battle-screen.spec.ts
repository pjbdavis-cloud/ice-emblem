import { expect, test, type Page } from "@playwright/test";

const MAP_WIDTH = 15;
const MAP_HEIGHT = 10;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const phaseBanner = page.locator(".phase-banner");
  await expect(phaseBanner).toBeVisible();
  await expect(phaseBanner).toBeHidden({ timeout: 3000 });
});

test("selects and deselects a unit by clicking its tile", async ({ page }) => {
  await clickTile(page, 1, 4);
  await expectSelectedPanelToContain(page, "Aster");
  await expect(page.getByText("Ready to move")).toBeVisible();

  await clickTile(page, 1, 4);
  await expect(page.getByText("No unit selected.")).toBeVisible();
});

test("stages and cancels a move through real canvas interaction", async ({ page }) => {
  await clickTile(page, 1, 4);
  await clickTile(page, 1, 3);

  await expect(page.getByText("1,3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Wait" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Wait" })).toBeHidden();
  await expectSelectedPanelToContain(page, "Aster");
});

test("hovering updates the hover panel separately from the selected panel", async ({ page }) => {
  await clickTile(page, 1, 4);
  await hoverTile(page, 5, 1);

  await expectSectionToContain(page, "Hover", "Bandit");
  await expectSectionToContain(page, "Hover", "Status: Enemy");
  await expectSectionToContain(page, "Selected", "Aster");
});

test("enemy phase resolves one enemy at a time and returns to player phase", async ({ page }) => {
  await page.getByRole("button", { name: "End Phase" }).click();
  await expect(page.locator(".phase-banner-enemy")).toBeVisible();
  await expect(page.locator(".phase-banner-enemy")).toBeHidden({ timeout: 4000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const api = (
            window as typeof window & {
              __ICE_EMBLEM_TEST_API__?: {
                getRuntimeState: () => unknown;
              };
            }
          ).__ICE_EMBLEM_TEST_API__;

          if (!api) {
            throw new Error("Missing test API");
          }

          const runtime = api.getRuntimeState() as {
            phase: string;
            units: Record<string, { team: string; hasActed: boolean }>;
          };

          const actedEnemyCount = Object.values(runtime.units).filter(
            (unit) => unit.team === "enemy" && unit.hasActed,
          ).length;

          return `${runtime.phase}:${actedEnemyCount}`;
        }),
      { timeout: 15000 },
    )
    .toBe("enemy:1");

  await expect(page.getByText("Turn 2 | PLAYER PHASE")).toBeVisible({ timeout: 30000 });
});

test("a defeated unit no longer appears on the board after lethal combat resolves", async ({ page }) => {
  await setDefeatedFighterScenario(page);

  await hoverTile(page, 3, 1);
  await expectSectionToContain(page, "Hover", "Position: 3,1");
});

async function clickTile(page: Page, x: number, y: number) {
  const canvas = page.getByTestId("battle-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Battle canvas was not visible");
  }

  await page.mouse.click(
    box.x + ((x + 0.5) * box.width) / MAP_WIDTH,
    box.y + ((y + 0.5) * box.height) / MAP_HEIGHT,
  );
}

async function hoverTile(page: Page, x: number, y: number) {
  const canvas = page.getByTestId("battle-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Battle canvas was not visible");
  }

  await page.mouse.move(
    box.x + ((x + 0.5) * box.width) / MAP_WIDTH,
    box.y + ((y + 0.5) * box.height) / MAP_HEIGHT,
  );
}

async function expectSelectedPanelToContain(page: Page, text: string) {
  await expectSectionToContain(page, "Selected", text);
}

async function expectSectionToContain(page: Page, heading: string, text: string) {
  const headingLocator = page.getByRole("heading", { name: heading });
  const section = headingLocator.locator("..");
  await expect(section.getByText(text)).toBeVisible();
}

async function setLethalArcherScenario(page: Page) {
  await page.evaluate(() => {
    const api = (
      window as typeof window & {
        __ICE_EMBLEM_TEST_API__?: {
          getRuntimeState: () => unknown;
          replaceRuntimeState: (runtime: unknown) => void;
        };
      }
    ).__ICE_EMBLEM_TEST_API__;

    if (!api) {
      throw new Error("Missing test API");
    }

    const runtime = structuredClone(api.getRuntimeState() as Record<string, unknown>) as {
      phase: string;
      turnNumber: number;
      selectedUnitId?: string;
      units: Record<string, {
        currentHp: number;
        position: { x: number; y: number };
        hasActed: boolean;
        hasMoved: boolean;
        isDefeated: boolean;
      }>;
    };

    runtime.phase = "player";
    runtime.turnNumber = 1;
    runtime.selectedUnitId = undefined;

    runtime.units["player-lord"].position = { x: 6, y: 5 };
    runtime.units["player-lord"].hasActed = false;
    runtime.units["player-lord"].hasMoved = false;
    runtime.units["player-lord"].isDefeated = false;
    runtime.units["player-lord"].currentHp = 20;

    runtime.units["player-archer"].position = { x: 1, y: 2 };
    runtime.units["player-archer"].hasActed = false;
    runtime.units["player-archer"].hasMoved = false;
    runtime.units["player-archer"].isDefeated = false;
    runtime.units["player-archer"].currentHp = 18;

    runtime.units["enemy-fighter"].position = { x: 3, y: 1 };
    runtime.units["enemy-fighter"].currentHp = 1;
    runtime.units["enemy-fighter"].hasActed = false;
    runtime.units["enemy-fighter"].hasMoved = false;
    runtime.units["enemy-fighter"].isDefeated = false;

    runtime.units["enemy-mage"].position = { x: 6, y: 2 };
    runtime.units["enemy-mage"].hasActed = false;
    runtime.units["enemy-mage"].hasMoved = false;
    runtime.units["enemy-mage"].isDefeated = false;
    runtime.units["enemy-mage"].currentHp = 16;

    api.replaceRuntimeState(runtime);
  });
}

async function setDefeatedFighterScenario(page: Page) {
  await page.evaluate(() => {
    const api = (
      window as typeof window & {
        __ICE_EMBLEM_TEST_API__?: {
          getRuntimeState: () => unknown;
          replaceRuntimeState: (runtime: unknown) => void;
        };
      }
    ).__ICE_EMBLEM_TEST_API__;

    if (!api) {
      throw new Error("Missing test API");
    }

    const runtime = structuredClone(api.getRuntimeState() as Record<string, unknown>) as {
      units: Record<string, {
        currentHp: number;
        position: { x: number; y: number };
        hasActed: boolean;
        hasMoved: boolean;
        isDefeated: boolean;
      }>;
    };

    runtime.units["enemy-fighter"].position = { x: 3, y: 1 };
    runtime.units["enemy-fighter"].currentHp = 0;
    runtime.units["enemy-fighter"].isDefeated = true;
    runtime.units["enemy-fighter"].hasActed = true;
    runtime.units["enemy-fighter"].hasMoved = true;

    api.replaceRuntimeState(runtime);
  });
}
