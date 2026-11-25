import { signIn, confirmChanges } from "./session";
import { test, expect } from "@playwright/test";
const headers = { authorization: "Bearer local-demo-token-only:admin" };
test("employee books on map for an interval and cancels their booking", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "D-015", exact: true }).click();
  await page
    .getByRole("button", { name: "Забронировать", exact: true })
    .click();
  const form = page.locator(".employee-booking");
  const day = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await form.getByLabel("Дата", { exact: true }).fill(day);
  await form.getByLabel("С", { exact: true }).fill("09:00");
  await form.getByLabel("До", { exact: true }).fill("18:00");
  await expect(form).toContainText("На выбранное время броней нет");
  await form
    .getByRole("button", { name: "Забронировать", exact: true })
    .click();
  await expect(
    form.getByRole("heading", { name: "Бронирование создано" }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Мои бронирования", exact: true })
    .click();
  await page.getByRole("button", { name: "Будущие", exact: true }).click();
  const card = page.locator("article").filter({ hasText: "D-015" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Отменить", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Отменить бронирование", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  const history = await page.request.get("http://127.0.0.1:3101/api/bookings", {
    headers: { authorization: "Bearer local-demo-token-only:employee" },
  });
  expect(history.ok()).toBeTruthy();
  expect(
    (await history.json()).some(
      (b: any) => b.workplace_id === "workplace-15" && b.status === "cancelled",
    ),
  ).toBe(true);
});
test("import center shows diff and applies only after explicit review", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("button", { name: "Импорт данных", exact: true })
    .click();
  await page.getByText("Посмотреть / вставить CSV", { exact: true }).click();
  await page
    .locator("textarea")
    .fill(
      "id,name,city,address\nui-import,Офис импорта,Иркутск,Тестовый адрес",
    );
  await page
    .getByRole("button", { name: "Проверить файл", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Создать", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/20261115-import-test.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Применить проверенные изменения",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Применено:" }),
  ).toContainText("Применено: 1");
});
test("lease UI previews separate office and manual common area and opens persisted agreement", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:3101/api/space-types", {
    headers,
    data: {
      id: "lease_ui_office",
      name: "Офис аренды",
      category: "OFFICE",
      subtype: "office",
    },
  });
  const p = await request.post(
    "http://127.0.0.1:3101/api/building-wizard/preview",
    {
      headers,
      data: {
        name: "Тест аренды",
        city: "Иркутск",
        address: "Тестовый адрес",
        floors: [
          {
            name: "1",
            number: 1,
            width: 1000,
            height: 800,
            svg: null,
            rooms: [
              {
                name: "Аренда 101",
                space_type_id: "lease_ui_office",
                area_m2: 100,
              },
            ],
          },
        ],
      },
    },
  );
  expect(p.ok()).toBeTruthy();
  const b = await request.post(
    "http://127.0.0.1:3101/api/building-wizard/apply",
    { headers, data: { previewId: (await p.json()).previewId } },
  );
  expect(b.ok()).toBeTruthy();
  await signIn(page, "admin");
  await page.getByRole("button", { name: "Аренда", exact: true }).click();
  await page.getByRole("button", { name: "+ Арендатор", exact: true }).click();
  const tenant = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Арендатор", exact: true }),
  });
  await tenant
    .getByLabel("Название", { exact: true })
    .fill("Тестовый арендатор");
  await tenant.getByRole("button", { name: "Сохранить", exact: true }).click();
  await confirmChanges(page);
  await expect(tenant.getByRole("status")).toContainText("Сохранено");
  await page
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Новый договор", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Арендатор", exact: true }).click();
  await page
    .getByRole("option", { name: "Тестовый арендатор", exact: true })
    .click();
  await page.getByLabel("Номер договора", { exact: true }).fill("UI-101");
  await page.getByLabel("С даты", { exact: true }).fill("2035-01-01");
  await page
    .getByLabel("До даты, не включая", { exact: true })
    .fill("2036-01-01");
  await page.getByRole("checkbox", { name: /Аренда 101/ }).check();
  await page
    .getByRole("combobox", { name: "Общие площади", exact: true })
    .selectOption("manual");
  await page
    .getByLabel("Общая площадь по договору, м²", { exact: true })
    .fill("17.5");
  await page.getByLabel("Офисы: за м² / месяц", { exact: true }).fill("2000");
  await page.getByLabel("Общие: за м² / месяц", { exact: true }).fill("700");
  await page
    .getByRole("button", { name: "Проверить и рассчитать", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Проверьте перед сохранением" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/20261115-lease-preview-test.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Подтвердить договор", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Договор UI-101 · Тестовый арендатор" }),
  ).toBeVisible();
  await expect(page.getByText("По договору: 17.5 м²")).toHaveCount(1);
});
