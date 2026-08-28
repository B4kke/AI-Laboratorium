import { expect, test } from "@playwright/test";

test("åpner laboratoriet, validerer designer og kjører en lokal duell", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");

  await expect(page.getByText("AI-Laboratorium", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Arenaen er klar")).toBeVisible();

  await page.getByRole("button", { name: "Arenadesigner" }).click();
  const idea = page.getByRole("textbox", { name: "Beskriv en ny arena" });
  const createArena = page.getByRole("button", { name: "Lag validert arena" });
  await idea.fill("for kort");
  await expect(createArena).toBeDisabled();
  await expect(page.getByText("Beskriv arenaen med minst 12 tegn")).toBeVisible();
  await idea.fill("To AI-er fordeler en knapp energireserve over flere runder.");
  await expect(createArena).toBeEnabled();

  await page.getByRole("button", { name: "Start hurtigduell" }).click();
  await expect(
    page.getByText(/Direkte strøm|Avspilling pågår|Avspilling fullført/),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Start hurtigduell" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
