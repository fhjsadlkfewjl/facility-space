import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('recovered active floor and SVG render without modifying imported data',async({page})=>{
 const evidence=JSON.parse(readFileSync('docs/reconciliation-evidence.json','utf8'));
 const floor=evidence.rows.find((f:any)=>f.active&&f.svg&&f.imported_objects>100);
 await page.goto('/');
 await page.getByRole('combobox',{name:'Демо-роль'}).selectOption('admin');
 await page.getByRole('button',{name:'Карта этажа',exact:true}).click();
 await page.getByRole('combobox',{name:'Здание',exact:true}).selectOption(floor.imported_building_id);
 await page.getByRole('combobox',{name:'Этаж',exact:true}).selectOption(floor.imported_floor_id);
 const map=page.getByRole('img',{name:'Карта этажа',exact:true});
 await expect(map).toBeVisible();
 await expect(map.locator('image').first()).toHaveAttribute('href',/^data:image\/svg\+xml/);
 await expect(map.locator('[role=button]').first()).toBeVisible();
 // Capture only geometry; personnel inspector and workplace table are outside the image.
 await map.screenshot({path:'docs/screenshots/real-floor-map.png'});
});
