import { test, expect } from "@playwright/test";
test("read-only review on imported data: overview, map, imports and library", async ({
  page,
}) => {
  // This test must not submit business forms or send mutating API requests.
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.abort();
    return route.continue();
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Демо-роль" }).selectOption("admin");
  await page.getByRole("button", { name: "Обзор АХО", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Рабочие места 3/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Требуют проверки \d/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/20261115-real-dashboard.png",
  });
  await page.getByRole("button", { name: "Карта этажа", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Здание", exact: true })
    .selectOption({ label: "БЦ «АЛЬФА»" });
  await page
    .getByRole("combobox", { name: "Этаж", exact: true })
    .selectOption("fl-108757");
  await expect(
    page.getByRole("img", { name: "Карта этажа", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("img", { name: "Карта этажа", exact: true })
    .screenshot({ path: "docs/screenshots/20261115-real-floor-map.png" });
  await page
    .getByRole("button", { name: "Импорт данных", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Скачать шаблон CSV", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/20261115-real-imports.png" });
  await page
    .getByRole("button", { name: "Библиотека мебели", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Новый тип мебели", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/20261115-real-furniture-library.png",
  });
});
