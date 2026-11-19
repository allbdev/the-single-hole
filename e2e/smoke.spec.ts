import { expect, test, type Page } from "@playwright/test";

/** Dev builds expose the game as `window.__game` (see src/main.ts). */
const world = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __game: { world: { connected: boolean; total: number } } }).__game.world,
  );

/** One real run against the local room: open, dig, see the depth go up, switch views, share. */
test("dig, see the world move, switch views and share", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?lang=pt&quality=low");

  await expect(page.getByRole("heading", { name: "Um buraco só" })).toBeVisible();
  await page.getByRole("button", { name: "Pegar uma colher" }).click();
  await expect(page.getByText("suas colheradas")).toBeVisible();

  // Wait for the welcome, then read the world total.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __game: { world: { connected: boolean } } }).__game.world.connected,
      ),
    )
    .toBe(true);
  const before = await world(page).then((w) => w.total);

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(90);
  }
  await expect
    .poll(() => world(page).then((w) => w.total), { timeout: 5000 })
    .toBeGreaterThanOrEqual(before + 6);
  await expect(page.locator(".dig-bar .value")).toHaveText(/[1-9]/);

  await page.getByRole("tab", { name: "Corte" }).click();
  await expect(page.getByText("Onde a gente está")).toBeVisible();
  await expect(page.locator(".marker .tag")).toContainText("ESTAMOS AQUI");

  await page.getByRole("tab", { name: "Mundo" }).click();
  await expect(page.getByText("Quem está cavando")).toBeVisible();

  await page.getByRole("tab", { name: "Buraco" }).click();
  await page.getByRole("button", { name: "Compartilhar" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nenhum dado seu vai junto: só os números.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByText("your scoops")).toBeVisible();

  expect(errors).toEqual([]);
});
