import { test, expect } from '@playwright/test';
test('employee: offices, map, assignment, people and no finance', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Здания', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Площади и стоимость', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Открыть карту' }).click();
  await expect(page.getByRole('img', { name: 'Карта этажа' })).toBeVisible();
  await page.getByRole('button', { name: 'D-007', exact: true }).click();
  await page.getByRole('button', { name: 'Занять самому', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText('Анна Смирнова');
  await page.getByRole('button', { name: 'Поиск людей', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск людей', exact: true }).fill('Анна');
  await expect(page.getByRole('heading', { name: 'Анна Смирнова' })).toBeVisible();
  await page.getByRole('button', { name: /D-007 · Показать/ }).click();
  await expect(page.locator('.inspector h2')).toHaveText('D-007');
  await page.getByRole('button',{name:'Моё место',exact:true}).click();
  await page.getByRole('button',{name:'Освободить моё место',exact:true}).click();
  await expect(page.getByText('Место не назначено. Выберите свободное рабочее место на карте.')).toBeVisible();
});
test('facilities: layout edit and costs', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Демо-роль' }).selectOption('facilities');
  await page.getByRole('button', { name: 'Редактор планировки', exact: true }).click();
  await page.getByRole('button', { name: 'D-001', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Мебель x', exact: true }).fill('140');
  await page.getByRole('spinbutton',{name:'Мебель rotation',exact:true}).fill('30');
  await page.getByRole('button',{name:'Шаг назад',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Мебель rotation',exact:true})).toHaveValue('0');
  await page.getByRole('button',{name:'Шаг вперёд',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Мебель rotation',exact:true})).toHaveValue('30');
  await page.getByRole('button', { name: 'Сохранить планировку', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Планировка сохранена');
  await page.getByText('Версии планировки',{exact:true}).click();
  await page.getByRole('combobox',{name:/Сравнить с текущей версией/}).selectOption('1');
  await expect(page.getByRole('button',{name:'Восстановить планировку',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Восстановить планировку',exact:true}).click();
  await expect(page.getByRole('spinbutton',{name:'Мебель rotation',exact:true})).toHaveValue('0');
  await page.getByRole('button', { name: 'Площади и стоимость', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расчёт по помещениям' })).toBeVisible();
  await expect(page.locator('table')).toContainText('RUB');
});
test('responsive employee view and desktop-only editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть карту' }).click();
  await expect(page.getByRole('img', { name: 'Карта этажа' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('combobox', { name: 'Демо-роль' }).selectOption('admin');
  await page.getByRole('button', { name: 'Редактор планировки', exact: true }).click();
  await expect(page.locator('.editor-mobile')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Сохранить планировку', exact: true }),
  ).toBeHidden();
});
test('facility: booking conflict, inventory check and analytics', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Демо-роль' }).selectOption('facilities');
  await page.getByRole('button', { name: 'Бронирования', exact: true }).click();
  await page.getByRole('combobox',{name:'Сотрудник',exact:true}).click();
  await page.getByRole('textbox',{name:'Поиск: Сотрудник',exact:true}).fill('Елена');
  await page.getByRole('option',{name:/Елена Петрова/}).click();
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Начало', { exact: true }).fill(day + 'T09:00');
  await page.getByLabel('Окончание', { exact: true }).fill(day + 'T18:00');
  await page.getByRole('combobox', { name: 'Место', exact: true }).selectOption('workplace-16');
  await page.getByRole('button', { name: 'Забронировать', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Подтверждено');
  await expect(
    page
      .getByRole('combobox', { name: 'Место', exact: true })
      .locator('option[value="workplace-16"]'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить бронь', exact: true }).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Место', exact: true })
      .locator('option[value="workplace-16"]'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Инвентаризация', exact: true }).click();
  await page.getByPlaceholder('Например, D-001').fill('D-016');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await page.getByRole('textbox', { name: 'Примечание', exact: true }).fill('E2E inspection');
  await page.getByRole('button', { name: 'Подтвердить проверку', exact: true }).click();
  await expect(page.getByRole('table')).not.toContainText('Не проверено');
  await page.getByRole('button', { name: 'Обзор АХО', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Сегодня и требует внимания' })).toBeVisible();
  await page.getByRole('button',{name:'Помещения',exact:true}).click();
  await expect(page.getByRole('table')).toContainText('301 · Product');
});
test('AHO quality review persists, reports download, parking and screenshots',async({page})=>{
 await page.goto('/');
 await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Обзор АХО',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Сегодня и требует внимания'})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/dashboard.png',fullPage:true});
 await page.getByRole('button',{name:'Качество данных',exact:true}).click();
 await page.getByRole('button',{name:'Записать результат',exact:true}).first().click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:/Результат проверки:/})});
 await form.locator('select[name=status]').selectOption('IN_REVIEW');
 await form.getByLabel('Комментарий',{exact:true}).fill('Проверить по исходному плану');
 await form.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(form).toHaveCount(0);
 await page.reload();
 await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Обзор АХО',exact:true}).click();
 await page.getByRole('button',{name:'Качество данных',exact:true}).click();
 await expect(page.getByRole('cell',{name:'Проверяем',exact:true}).first()).toBeVisible();
 await page.screenshot({path:'docs/screenshots/data-quality.png',fullPage:false});
 await page.getByRole('button',{name:'Инвентаризация',exact:true}).click();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'CSV всего реестра',exact:true}).click();
 expect((await download).suggestedFilename()).toMatch(/csv$/);
 await page.screenshot({path:'docs/screenshots/inventory.png',fullPage:false});
 await page.getByRole('button',{name:'Парковка',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Парковка',exact:true})).toBeVisible();
 await expect(page.getByText('Парковки и тарифы в демо — синтетические примеры, не данные компании.')).toHaveCount(0);
 await page.getByRole('button',{name:'Бронирования',exact:true}).click();
 await page.screenshot({path:'docs/screenshots/booking.png',fullPage:false});
 await page.getByRole('button',{name:'Редактор планировки',exact:true}).click();
 await page.getByRole('button',{name:'D-001',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Мебель rotation',exact:true})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/layout-editor.png',fullPage:true});
 await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('employee');
 await page.getByRole('button',{name:'Открыть карту'}).click();
 await expect(page.getByRole('button',{name:'Моё место',exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Карта этажа',exact:true})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/employee.png',fullPage:true});
});

test('room parameters identify location, prefill values and apply a documented correction',async({page})=>{
 await page.goto('/');
 await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Площади и стоимость',exact:true}).click();
 await page.getByRole('combobox',{name:'Здание помещения',exact:true}).selectOption('demo-building');
 await page.getByRole('combobox',{name:'Этаж помещения',exact:true}).selectOption('demo-floor');
 const rooms=page.getByRole('combobox',{name:'Помещение',exact:true});
 await expect(rooms).toContainText('301');
 await rooms.selectOption({index:1});
 const form=page.locator('form').filter({has:page.getByRole('button',{name:'Применить изменения помещения'})});
 await expect(form.getByLabel('Площадь по документам, м²',{exact:true})).not.toHaveValue('');
 await form.getByLabel('Площадь по документам, м²',{exact:true}).fill('123.45');
 await form.getByLabel('Основание изменения',{exact:true}).fill('Synthetic UAT measurement document');
 const saved=page.waitForResponse(r=>r.url().includes('/parameters')&&r.request().method()==='PATCH');
 await form.getByRole('button',{name:'Применить изменения помещения'}).click();
 expect((await saved).status()).toBe(200);
 await expect(page.getByRole('combobox',{name:'Помещение',exact:true})).toContainText('123.45 м²');
 await page.getByRole('button',{name:'Обзор АХО',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Сегодня и требует внимания'})).toBeVisible();
});
test('map room selection opens editable identity and area beside highlighted contour',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 await page.getByRole('combobox',{name:'Режим карты'}).selectOption('rooms');
 const room=page.getByRole('button',{name:'Помещение 301 · Product',exact:true});await room.click();
 await expect(room).toHaveAttribute('aria-pressed','true');
 await page.getByText('Изменить название, назначение и площадь',{exact:true}).click();
 const name=page.getByRole('textbox',{name:'Номер и понятное название',exact:true});await expect(name).toHaveValue('301 · Product');
 await name.fill('301 — тестовое название');
 await page.getByRole('textbox',{name:'Основание изменения',exact:true}).fill('Synthetic room identity verification');
 await page.getByRole('button',{name:'Применить изменения помещения'}).click();
 await expect(page.getByRole('button',{name:'Помещение 301 — тестовое название',exact:true})).toBeVisible();
 await page.getByText('Рассчитать площади по известным комнатам',{exact:true}).click();
 await expect(page.getByText('До подтверждения расчёт предварительный',{exact:false})).toBeVisible();
});
test('map inventory mode checks the selected item and filters completed work',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 await page.getByRole('combobox',{name:'Режим карты'}).selectOption('inventory');
 await page.getByRole('checkbox',{name:'Показать только непроверенные предметы'}).check();
 await page.getByRole('button',{name:'D-007',exact:true}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Проверка предмета на карте'})});
 await form.getByRole('textbox',{name:'Результат осмотра',exact:true}).fill('Synthetic map inventory inspection');
 await form.getByRole('button',{name:'Подтвердить проверку предмета',exact:true}).click();
 await expect(page.getByRole('button',{name:'D-007',exact:true})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Показать только непроверенные предметы'}).uncheck();
 await expect(page.getByRole('button',{name:'D-007',exact:true})).toBeVisible();
 await expect(form).toContainText('Последняя проверка:');
});
test('department filter lives on the floor map without a separate teams menu',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await expect(page.getByRole('button',{name:'Команды',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 const filter=page.getByRole('combobox',{name:'Подразделение',exact:true});
 await filter.click();await page.getByRole('textbox',{name:'Поиск: Подразделение',exact:true}).fill('прод');await expect(page.getByRole('option',{name:'Разработка',exact:true})).toHaveCount(0);await page.getByRole('option',{name:'Продукт',exact:true}).click();
 const table=page.locator('table').filter({hasText:'Рабочее место'});
 await expect(table).toContainText('Продукт');await expect(table).not.toContainText('Разработка');
 await filter.click();await page.getByRole('option',{name:'Все подразделения',exact:true}).click();await expect(table).toContainText('Разработка');
});
test('workplace registry chooses employee inline and releases explicitly',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Рабочие места',exact:true}).click();
 await expect(page.getByText('Постоянное назначение',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Снять выбор',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Поиск в реестре',exact:true}).fill('D-007');
 const row=page.getByRole('row').filter({hasText:'D-007'});
 await row.getByRole('button',{name:'Назначить сотрудника',exact:true}).click();
 const panel=page.getByRole('region',{name:'Назначение сотрудника'});
 await expect(panel.getByRole('button',{name:'Подтвердить назначение'})).toBeDisabled();
 await panel.getByRole('textbox',{name:'Сотрудник',exact:true}).fill('Михаил');
 await panel.getByRole('button',{name:'Михаил Волков',exact:false}).click();
 page.on('dialog',d=>d.accept());
 await panel.getByRole('button',{name:'Перенести на это место'}).click();
 await expect(row).toContainText('Михаил Волков');
 await row.getByRole('button',{name:'Снять назначение',exact:true}).click();
 await expect(row).not.toContainText('Михаил Волков');
 await expect(row.getByRole('button',{name:'Назначить сотрудника',exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'Только места без назначений и броней',exact:true}).check();
 await row.getByRole('checkbox',{name:'Выбрать D-007',exact:true}).check();
 await expect(page.getByRole('button',{name:'Снять выбор',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Снять выбор',exact:true}).click();
 await expect(page.getByRole('button',{name:'Снять выбор',exact:true})).toHaveCount(0);
});
test('desks remain selectable in room and analytical map modes',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 for(const mode of ['rooms','type','area','quality','cost']){
  await page.getByRole('combobox',{name:'Режим карты'}).selectOption(mode);
  await page.getByRole('button',{name:'D-007',exact:true}).click();
  await expect(page.locator('.inspector').getByRole('heading',{name:'D-007',exact:true})).toBeVisible();
 }
 await expect(page.locator('.map-toolbar .version')).toHaveCount(0);
 const sizes=await page.locator('section').filter({has:page.getByRole('heading',{name:/^Рабочие места/})}).locator('.table-scroll').evaluate(el=>({available:el.clientWidth,table:el.querySelector('table')!.getBoundingClientRect().width}));
 expect(sizes.table).toBeGreaterThanOrEqual(sizes.available-2);
});
test('map employee picker searches and selects in a single dropdown',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 await page.getByRole('button',{name:'D-007',exact:true}).click();
 const inspector=page.locator('.inspector');
 await expect(inspector.getByRole('button',{name:'Назначить',exact:true})).toBeDisabled();
 await inspector.getByRole('combobox',{name:'Сотрудник',exact:true}).click();
 await inspector.getByRole('textbox',{name:'Поиск: Сотрудник',exact:true}).fill('Михаил');
 await inspector.getByRole('option',{name:/Михаил Волков/}).click();
 await expect(inspector.getByRole('combobox',{name:'Сотрудник',exact:true})).toContainText('Михаил Волков');
 await expect(inspector.getByRole('textbox')).toHaveCount(0);
 await expect(inspector.getByRole('button',{name:'Назначить',exact:true})).toBeEnabled();
});
test('parking uses one searchable employee picker and submits selected identity',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Парковка',exact:true}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Назначение парковки сотруднику',exact:true})});
 await expect(form.getByRole('button',{name:'Назначить / перенести',exact:true})).toBeDisabled();
 await form.getByRole('combobox',{name:'Сотрудник',exact:true}).click();
 await form.getByRole('textbox',{name:'Поиск: Сотрудник',exact:true}).fill('Михаил');
 await form.getByRole('option',{name:/Михаил Волков/}).click();
 await expect(form.getByRole('textbox',{name:'Поиск: Сотрудник',exact:true})).toHaveCount(0);
 await form.getByRole('combobox',{name:'Парковочное место',exact:true}).selectOption('parking-2');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/parking/assignments')&&r.request().method()==='POST');
 await form.getByRole('button',{name:'Назначить / перенести',exact:true}).click();
 const saved=await response;expect(saved.status()).toBe(200);expect(saved.request().postDataJSON().employeeId).toBe('employee-2');
 await expect(form.getByRole('status')).toContainText('Сохранено');
 await form.getByRole('combobox',{name:'Парковочное место',exact:true}).selectOption('');
 await expect(form.getByRole('button',{name:'Назначить / перенести',exact:true})).toBeDisabled();
 page.once('dialog',dialog=>dialog.dismiss());
 await form.getByRole('button',{name:'Снять назначение',exact:true}).click();
 await expect(form).toContainText('Текущее место: P-2');
 page.once('dialog',dialog=>dialog.accept());
 await form.getByRole('button',{name:'Снять назначение',exact:true}).click();
 await expect(form).toContainText('Назначение парковочного места снято.');
 await expect(form.getByRole('button',{name:'Снять назначение',exact:true})).toHaveCount(0);
});
test('map release confirms employee and workplace and respects cancellation',async({page,request})=>{
 const setup=await request.post('http://127.0.0.1:3101/api/assignments',{headers:{authorization:'Bearer local-demo-token-only:admin'},data:{employeeId:'employee-2',workplaceId:'workplace-2'}});expect(setup.ok()).toBeTruthy();
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Открыть карту',exact:false}).click();
 await page.getByRole('button',{name:'D-002',exact:true}).click();
 const panel=page.locator('.inspector');
 page.once('dialog',async d=>{expect(d.message()).toContain('D-002');expect(d.message()).toContain('Михаил Волков');await d.dismiss();});
 await panel.getByRole('button',{name:'Снять назначение',exact:true}).click();
 await expect(panel).toContainText('Михаил Волков');
 page.once('dialog',d=>d.accept());
 await panel.getByRole('button',{name:'Снять назначение',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Снять назначение',exact:true})).toHaveCount(0);
 await expect(panel).toContainText('Место свободно');
});
test('furniture template dimensions accept comma and dot and reject invalid sizes',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Настройки объектов',exact:true}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Шаблон мебели',exact:true})});
 await form.getByLabel('Название',{exact:true}).fill('Test dimensions');
 await form.getByLabel('Ширина в единицах плана',{exact:true}).fill('0');
 await form.getByLabel('Глубина в единицах плана',{exact:true}).fill('60.25');
 await form.getByRole('button',{name:'Создать шаблон',exact:true}).click();
 await expect(form).toContainText('Ширина: введите число больше 0');
 await form.getByLabel('Ширина в единицах плана',{exact:true}).fill('80,5');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/templates')&&r.request().method()==='POST');
 await form.getByRole('button',{name:'Создать шаблон',exact:true}).click();
 const saved=await response;expect(saved.status()).toBe(200);expect(saved.request().postDataJSON()).toMatchObject({width:80.5,depth:60.25});
});
test('editor adds furniture at a map-selected position instead of arbitrary defaults',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Редактор планировки',exact:true}).click();
 await page.getByText('План, масштаб и добавление мебели',{exact:true}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Добавить мебель',exact:true})});
 await expect(form.getByRole('button',{name:'Добавить на этаж',exact:true})).toBeDisabled();
 await form.getByRole('combobox',{name:'Шаблон',exact:true}).selectOption('desk');
 await form.getByLabel('Ширина',{exact:true}).fill('30');await form.getByLabel('Глубина',{exact:true}).fill('20');
 await form.getByRole('button',{name:'Указать положение на карте',exact:true}).click();
 const svg=page.getByRole('img',{name:'Карта этажа',exact:true});
 await svg.scrollIntoViewIfNeeded();
 const p=await svg.evaluate(el=>{const svg=el as unknown as SVGSVGElement;const p=svg.createSVGPoint();p.x=600;p.y=500;const screen=p.matrixTransform(svg.getScreenCTM()!);return{x:screen.x,y:screen.y};});
 await page.mouse.click(p.x,p.y);
 expect(Math.abs(Number(await form.getByLabel('X центра',{exact:true}).inputValue())-600)).toBeLessThanOrEqual(3);
 expect(Math.abs(Number(await form.getByLabel('Y центра',{exact:true}).inputValue())-500)).toBeLessThanOrEqual(3);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/furniture')&&r.request().method()==='POST');
 await form.getByRole('button',{name:'Добавить на этаж',exact:true}).click();
 expect((await response).status()).toBe(200);
 await expect(form).toContainText('Предмет добавлен на выбранный этаж.');
});
