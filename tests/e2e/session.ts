import { expect, type Page } from "@playwright/test";
export async function signIn(
  page: Page,
  role: "employee" | "facilities" | "admin" = "employee",
) {
  await page.goto("/");
  await page.evaluate(() => sessionStorage.removeItem("office-token"));
  await page.goto(role === "employee" ? "/" : "/?review=admin");
  await page
    .getByLabel("Access token", { exact: true })
    .fill(`local-demo-token-only:${role}`);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}
export async function confirmChanges(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Подтверждение изменений",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}
