import { signIn, confirmChanges } from "./session";
import { test, expect } from "@playwright/test";
test("employee: offices, map, assignment, people and no finance", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("img", { name: "Карта этажа", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Площади и стоимость", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Здания", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Здания", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: true })
    .click();
  await page.getByRole("button", { name: "D-007", exact: true }).click();
  await page.getByRole("button", { name: "Занять", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Перенести", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText("Моё рабочее место");
  await page.getByRole("button", { name: "Люди", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Поиск людей", exact: true })
    .fill("Анна");
  const row = page.getByRole("row").filter({ hasText: "Анна Смирнова" });
  await expect(row).toContainText("D-007");
  await row.getByRole("button", { name: "На карте", exact: true }).click();
  await expect(page.locator(".inspector h2")).toHaveText("D-007");
  await page
    .getByRole("button", { name: "Освободить место", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Освободить", exact: true })
    .click();
  await expect(page.locator(".my-place-strip")).toContainText(
    "Рабочее место не назначено",
  );
});
test("facilities: layout draft, undo, redo, save and costs", async ({
  page,
  request,
}) => {
  const headers = { authorization: "Bearer local-demo-token-only:facilities" };
  const load = async () => {
    const r = await request.get(
      "http://127.0.0.1:3101/api/floors/demo-floor/layout",
      { headers },
    );
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const before = await load(),
    item = before.furniture.find((f: any) => f.code === "D-001");
  await signIn(page, "facilities");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Редактор планировки", exact: true })
    .click();
  const editor = page.locator(".layout-draft-editor");
  await editor.getByRole("button", { name: "Мебель", exact: true }).click();
  await editor.getByRole("button", { name: "D-001", exact: true }).click();
  await editor
    .getByRole("button", { name: "Повернуть на 30°", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeEnabled();
  expect((await load()).floor.version).toBe(before.floor.version);
  await editor.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeDisabled();
  await editor.getByRole("button", { name: "Вперёд", exact: true }).click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/floors/demo-floor/editor") &&
      r.request().method() === "PUT",
  );
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(
    editor.getByText("Все изменения сохранены одной версией", { exact: true }),
  ).toBeVisible();
  const after = await load();
  expect(after.floor.version).toBe(before.floor.version + 1);
  expect(
    Number(after.furniture.find((f: any) => f.id === item.id).rotation),
  ).toBe((Number(item.rotation) + 30) % 360);
  // Return the test desk to its original rotation through the same UI.
  for (let i = 0; i < 11; i++)
    await editor
      .getByRole("button", { name: "Повернуть на 30°", exact: true })
      .click();
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeDisabled();
  expect(
    Number(
      (await load()).furniture.find((f: any) => f.id === item.id).rotation,
    ),
  ).toBe(Number(item.rotation));
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Площади и стоимость", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Расчёт по помещениям" }),
  ).toBeVisible();
  await expect(page.locator("table").first()).toContainText("RUB");
});
test("responsive employee map and desktop editor controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(
    page.getByRole("img", { name: "Карта этажа", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Редактор планировки", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Редактор этажа", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeDisabled();
});
test("facility: booking conflict, inventory check and analytics", async ({
  page,
  request,
}) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, "facilities");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Бронирования", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Бронирование", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Сотрудник", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Поиск: Сотрудник", exact: true })
    .fill("Елена");
  await page.getByRole("option", { name: /Елена Петрова/ }).click();
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Начало", { exact: true }).fill(day + "T09:00");
  await page.getByLabel("Окончание", { exact: true }).fill(day + "T18:00");
  await page
    .getByRole("combobox", { name: "Место", exact: true })
    .selectOption("workplace-16");
  const bookingResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/bookings") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Забронировать", exact: true })
    .click();
  await confirmChanges(page);
  const booked = await bookingResponse;
  expect(booked.status()).toBe(200);
  const duplicate = await request.post("http://127.0.0.1:3101/api/bookings", {
    headers: { authorization: "Bearer local-demo-token-only:facilities" },
    data: booked.request().postDataJSON(),
  });
  expect(duplicate.status()).toBe(409);
  await page
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("Подтверждено");
  await page
    .getByRole("button", { name: "Отменить бронь", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Отменить бронь", exact: true })
    .click();
  await confirmChanges(page);
  await expect(page.getByRole("table")).toContainText("Отменено");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Инвентарь", exact: true })
    .click();
  await page.getByPlaceholder("Например, D-001").fill("D-016");
  await page.getByRole("cell", { name: "D-016", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Примечание", exact: true })
    .fill("E2E inspection");
  await page
    .getByRole("button", { name: "Подтвердить проверку", exact: true })
    .click();
  await confirmChanges(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("table")).toContainText("D-016");
  await expect(page.getByRole("table")).not.toContainText("Не проверено");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Сегодня", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Помещения", exact: true })
    .click();
  await expect(page.getByRole("table")).toContainText("301 · Product");
});
test("AHO quality review persists, reports download, parking and screenshots", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Сегодня", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Качество данных", exact: true })
    .click();
  await page
    .getByRole("cell", { name: "Проверить", exact: true })
    .getByRole("button")
    .click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: /Результат проверки:/ }),
    });
  await form.locator("select[name=status]").selectOption("IN_REVIEW");
  await form
    .getByLabel("Комментарий", { exact: true })
    .fill("Проверить по исходному плану");
  await form.getByRole("button", { name: "Сохранить", exact: true }).click();
  await confirmChanges(page);
  await expect(form).toHaveCount(0);
  await page.reload();
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Сегодня", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Качество данных", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Проверяем", exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/data-quality.png",
    fullPage: false,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Инвентарь", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "CSV всего реестра", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/csv$/);
  await page.screenshot({
    path: "docs/screenshots/inventory.png",
    fullPage: false,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Парковка", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Парковка", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Парковки и тарифы в демо — синтетические примеры, не данные компании.",
    ),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Бронирования", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/booking.png",
    fullPage: false,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Редактор планировки", exact: true })
    .click();
  await page
    .locator(".layout-draft-editor")
    .getByRole("button", { name: "Мебель", exact: true })
    .click();
  await page.getByRole("button", { name: "D-001", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Повернуть на 30°", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/layout-editor.png",
    fullPage: true,
  });
  await signIn(page, "employee");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта" })
    .click();
  await expect(page.locator(".my-place-strip")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Карта этажа", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/employee.png",
    fullPage: true,
  });
});

test("room parameters identify location, prefill values and apply a documented correction", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Помещение 301 · Product", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Редактировать помещение", exact: true })
    .click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Применить изменения помещения" }),
    });
  await expect(
    form.getByLabel("Площадь по документам, м²", { exact: true }),
  ).not.toHaveValue("");
  await form
    .getByLabel("Площадь по документам, м²", { exact: true })
    .fill("123.45");
  await form
    .getByLabel("Основание изменения", { exact: true })
    .fill("Synthetic UAT measurement document");
  const saved = page.waitForResponse(
    (r) => r.url().includes("/parameters") && r.request().method() === "PATCH",
  );
  await form
    .getByRole("button", { name: "Применить изменения помещения" })
    .click();
  await confirmChanges(page);
  expect((await saved).status()).toBe(200);
  await expect(
    form.getByLabel("Площадь по документам, м²", { exact: true }),
  ).toHaveValue("123.45");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText("123.45");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Сегодня", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
});
test("map room selection opens editable identity and area beside highlighted contour", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Режим карты" })
    .selectOption("occupancy");
  const room = page.getByRole("button", {
    name: "Помещение 301 · Product",
    exact: true,
  });
  await room.click();
  await expect(room).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Редактировать помещение", exact: true })
    .click();
  const name = page.getByRole("textbox", {
    name: "Номер и понятное название",
    exact: true,
  });
  await expect(name).toHaveValue("301 · Product");
  await name.fill("301 — тестовое название");
  await page
    .getByRole("textbox", { name: "Основание изменения", exact: true })
    .fill("Synthetic room identity verification");
  await page
    .getByRole("button", { name: "Применить изменения помещения" })
    .click();
  await confirmChanges(page);
  await expect(
    page.getByRole("button", {
      name: "Помещение 301 — тестовое название",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText(
    "301 — тестовое название",
  );
});
test("map inventory mode checks the selected item and filters completed work", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Режим карты" })
    .selectOption("inventory");
  await page
    .getByRole("checkbox", { name: "Показать только непроверенные предметы" })
    .check();
  await page.getByRole("button", { name: "D-007", exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: "Проверка предмета на карте" }),
    });
  await form
    .getByRole("textbox", { name: "Результат осмотра", exact: true })
    .fill("Synthetic map inventory inspection");
  await form
    .getByRole("button", { name: "Подтвердить проверку предмета", exact: true })
    .click();
  await confirmChanges(page);
  await expect(
    page.getByRole("button", { name: "D-007", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Показать только непроверенные предметы" })
    .uncheck();
  await expect(
    page.getByRole("button", { name: "D-007", exact: true }),
  ).toBeVisible();
  await expect(form).toContainText("Последняя проверка:");
});
test("department filter lives on the floor map without a separate teams menu", async ({
  page,
}) => {
  await signIn(page, "admin");
  await expect(
    page.getByRole("button", { name: "Команды", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  await page
    .getByRole("combobox", { name: "Режим карты" })
    .selectOption("department");
  const filter = page.getByRole("combobox", {
    name: "Подразделение",
    exact: true,
  });
  await filter.click();
  await page
    .getByRole("textbox", { name: "Поиск: Подразделение", exact: true })
    .fill("прод");
  await expect(
    page.getByRole("option", { name: "Разработка", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Продукт", exact: true }).click();
  await page.getByRole("button", { name: "Таблица", exact: true }).click();
  await page
    .locator("main")
    .getByRole("button", { name: "Рабочие места", exact: true })
    .click();
  const table = page.getByRole("table");
  await expect(table).toContainText("Продукт");
  await expect(table).not.toContainText("Разработка");
  await filter.click();
  await page
    .getByRole("option", { name: "Все подразделения", exact: true })
    .click();
  await expect(table).toContainText("Разработка");
});
test("workplace registry chooses employee inline and releases explicitly", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Рабочие места", exact: true })
    .click();
  await expect(
    page.getByText("Постоянное назначение", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Снять выбор", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Поиск в реестре", exact: true })
    .fill("D-007");
  const row = page.getByRole("row").filter({ hasText: "D-007" });
  await row.getByLabel("Действия с рабочим местом").click();
  await row
    .getByRole("button", { name: "Назначить сотрудника", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Назначение сотрудника" });
  await expect(
    panel.getByRole("button", { name: "Подтвердить назначение" }),
  ).toBeDisabled();
  await panel
    .getByRole("textbox", { name: "Сотрудник", exact: true })
    .fill("Михаил");
  await panel
    .getByRole("button", { name: "Михаил Волков", exact: false })
    .click();
  page.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Перенести на это место" }).click();
  await expect(row).toContainText("Михаил Волков");
  await row
    .getByRole("button", { name: "Снять назначение", exact: true })
    .click();
  await expect(row).not.toContainText("Михаил Волков");
  await expect(
    row.getByRole("button", { name: "Назначить сотрудника", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Только места без назначений и броней",
      exact: true,
    })
    .check();
  await row
    .getByRole("checkbox", { name: "Выбрать D-007", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Снять выбор", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Снять выбор", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Снять выбор", exact: true }),
  ).toHaveCount(0);
});
test("desks remain selectable in room and analytical map modes", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  for (const mode of [
    "occupancy",
    "department",
    "type",
    "inventory",
    "area",
    "quality",
    "lease",
  ]) {
    await page
      .getByRole("combobox", { name: "Режим карты" })
      .selectOption(mode);
    await page.getByRole("button", { name: "D-007", exact: true }).click();
    await expect(
      page
        .locator(".inspector")
        .getByRole("heading", { name: "D-007", exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".map-toolbar .version")).toHaveCount(0);
  await page.getByRole("button", { name: "Таблица", exact: true }).click();
  const sizes = await page
    .locator(".table-scroll")
    .evaluate((el) => ({
      available: el.clientWidth,
      table: el.querySelector("table")!.getBoundingClientRect().width,
    }));
  expect(sizes.table).toBeGreaterThanOrEqual(sizes.available - 2);
});
test("map employee picker searches and selects in a single dropdown", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  await page.getByRole("button", { name: "D-007", exact: true }).click();
  const inspector = page.locator(".inspector");
  await expect(
    inspector.getByRole("button", { name: "Назначить", exact: true }),
  ).toBeDisabled();
  await inspector
    .getByRole("textbox", { name: "Сотрудник", exact: true })
    .fill("Михаил");
  await inspector.getByRole("button", { name: /Михаил Волков/ }).click();
  await expect(
    inspector.getByRole("textbox", { name: "Сотрудник", exact: true }),
  ).toHaveValue("Михаил Волков");
  await expect(
    inspector.getByRole("combobox", { name: "Сотрудник", exact: true }),
  ).toHaveCount(0);
  await expect(
    inspector.getByRole("button", {
      name: /Назначить|Переназначить/,
      exact: true,
    }),
  ).toBeEnabled();
});
test("parking uses one searchable employee picker and submits selected identity", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Парковка", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Управление парковкой", exact: true })
    .click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", {
        name: "Назначение парковки сотруднику",
        exact: true,
      }),
    });
  await expect(
    form.getByRole("button", { name: "Назначить / перенести", exact: true }),
  ).toBeDisabled();
  await form.getByRole("combobox", { name: "Сотрудник", exact: true }).click();
  await form
    .getByRole("textbox", { name: "Поиск: Сотрудник", exact: true })
    .fill("Михаил");
  await form.getByRole("option", { name: /Михаил Волков/ }).click();
  await expect(
    form.getByRole("textbox", { name: "Поиск: Сотрудник", exact: true }),
  ).toHaveCount(0);
  await form
    .getByRole("combobox", { name: "Парковочное место", exact: true })
    .selectOption("parking-2");
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/parking/assignments") &&
      r.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: "Назначить / перенести", exact: true })
    .click();
  await confirmChanges(page);
  const saved = await response;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON().employeeId).toBe("employee-2");
  await expect(form.getByRole("status")).toContainText("Сохранено");
  await form
    .getByRole("combobox", { name: "Парковочное место", exact: true })
    .selectOption("");
  await expect(
    form.getByRole("button", { name: "Назначить / перенести", exact: true }),
  ).toBeDisabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await form
    .getByRole("button", { name: "Снять назначение", exact: true })
    .click();
  await expect(form).toContainText("Текущее место: P-2");
  page.once("dialog", (dialog) => dialog.accept());
  await form
    .getByRole("button", { name: "Снять назначение", exact: true })
    .click();
  await expect(form).toContainText("Назначение парковочного места снято.");
  await expect(
    form.getByRole("button", { name: "Снять назначение", exact: true }),
  ).toHaveCount(0);
});
test("map release confirms employee and workplace and respects cancellation", async ({
  page,
  request,
}) => {
  const setup = await request.post("http://127.0.0.1:3101/api/assignments", {
    headers: { authorization: "Bearer local-demo-token-only:admin" },
    data: { employeeId: "employee-2", workplaceId: "workplace-2" },
  });
  expect(setup.ok()).toBeTruthy();
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Карта", exact: false })
    .click();
  await page.getByRole("button", { name: "D-002", exact: true }).click();
  const panel = page.locator(".inspector");
  await panel
    .getByRole("button", { name: "Снять назначение", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Подтвердить назначение",
  });
  await expect(confirmation).toContainText("D-002");
  await expect(confirmation).toContainText("Михаил Волков");
  await confirmation
    .getByRole("button", { name: "Отмена", exact: true })
    .click();
  await expect(panel).toContainText("Михаил Волков");
  await panel
    .getByRole("button", { name: "Снять назначение", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Снять назначение", exact: true }),
  ).toHaveCount(0);
  await expect(panel).toContainText("Место свободно");
});
test("editor rejects invalid dimensions and accepts decimal sizes in a draft", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Редактор планировки", exact: true })
    .click();
  const editor = page.locator(".layout-draft-editor");
  await editor.getByRole("button", { name: "Мебель", exact: true }).click();
  await editor.getByText("Добавить мебель", { exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Шаблон", exact: true })
    .selectOption("desk");
  await editor.getByLabel("Ширина, ед. плана", { exact: true }).fill("0");
  await editor.getByLabel("Глубина, ед. плана", { exact: true }).fill("20.25");
  await editor
    .getByRole("button", { name: "Указать место на плане", exact: true })
    .click();
  const svg = page.getByRole("img", { name: "Редактор этажа", exact: true });
  const point = await svg.evaluate((el) => {
    const s = el as unknown as SVGSVGElement,
      p = s.createSVGPoint();
    p.x = 600;
    p.y = 500;
    const q = p.matrixTransform(s.getScreenCTM()!);
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(editor.getByRole("alert")).toContainText(
    "Укажите ширину и глубину предмета",
  );
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeDisabled();
  await editor.getByLabel("Ширина, ед. плана", { exact: true }).fill("30.5");
  await page.mouse.click(point.x, point.y);
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeEnabled();
  page.once("dialog", (d) => d.accept());
  await editor
    .getByRole("button", { name: "Отменить всё", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Сохранить изменения", exact: true }),
  ).toBeDisabled();
});
test("editor adds furniture at a map-selected position and saves one draft", async ({
  page,
  request,
}) => {
  const headers = { authorization: "Bearer local-demo-token-only:admin" };
  const load = async () => {
    const r = await request.get(
      "http://127.0.0.1:3101/api/floors/demo-floor/layout",
      { headers },
    );
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  const before = await load();
  await signIn(page, "admin");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Редактор планировки", exact: true })
    .click();
  const editor = page.locator(".layout-draft-editor");
  await editor.getByRole("button", { name: "Мебель", exact: true }).click();
  await editor.getByText("Добавить мебель", { exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Указать место на плане", exact: true }),
  ).toBeDisabled();
  await editor
    .getByRole("combobox", { name: "Шаблон", exact: true })
    .selectOption("desk");
  await editor.getByLabel("Ширина, ед. плана", { exact: true }).fill("30");
  await editor.getByLabel("Глубина, ед. плана", { exact: true }).fill("20");
  await editor
    .getByLabel("Номер места (необязательно)", { exact: true })
    .fill("E2E-DESK");
  await editor
    .getByRole("button", { name: "Указать место на плане", exact: true })
    .click();
  const svg = page.getByRole("img", { name: "Редактор этажа", exact: true });
  await svg.scrollIntoViewIfNeeded();
  const p = await svg.evaluate((el) => {
    const svg = el as unknown as SVGSVGElement;
    const p = svg.createSVGPoint();
    p.x = 600;
    p.y = 500;
    const screen = p.matrixTransform(svg.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(p.x, p.y);
  await expect(
    editor.getByRole("heading", { name: "Стол 140 × 70", exact: true }),
  ).toBeVisible();
  expect((await load()).furniture.length).toBe(before.furniture.length);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/floors/demo-floor/editor") &&
      r.request().method() === "PUT",
  );
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON().additions).toHaveLength(1);
  const added = saved.request().postDataJSON().additions[0];
  expect(Math.abs(added.x - 600)).toBeLessThanOrEqual(3);
  expect(Math.abs(added.y - 500)).toBeLessThanOrEqual(3);
  const after = await load();
  expect(after.furniture.length).toBe(before.furniture.length + 1);
  expect(after.furniture.some((f: any) => f.code === "E2E-DESK")).toBe(true);
});
