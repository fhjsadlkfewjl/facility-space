import {DrawerAction,RegistryShell,StatusChip,templateGroups,TemplatePreview} from './workspace-ui';
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUI } from "./store";
import { useFacility, ActionForm, DataTable } from "./facility";
import { SearchSelect } from "./search-select";
import type { Actor } from "@office/shared";
export const furnitureCategories: Record<string, string> = {
  desk: "Стол",
  chair: "Кресло / стул",
  cabinet: "Шкаф",
  pedestal: "Тумба",
  sofa: "Диван",
  meeting_table: "Переговорный стол",
  storage: "Хранение",
  sanitary: "Сантехника",
  equipment: "Оборудование",
  other: "Другое",
};
const val = (d: FormData, k: string) => String(d.get(k) ?? "");
const date = (v: string) => v?.slice(0, 10);
export function FurnitureLibrary() {
  const list = useFacility<any[]>("/templates"),
    [q, setQ] = useState("");
  return (
    <>
      <p>
        Создайте тип мебели с размерами в метрах. На этаже с подтверждённым
        масштабом размеры переведутся в единицы плана.
      </p>
      <DrawerAction title="+ Новый тип мебели">
      <ActionForm
        title="Новый тип мебели"
        label="Создать тип мебели"
        submit={async (d) => {
          const f = d.get("svg") as File;
          return api("/templates", {
            name: val(d, "name"),
            category: val(d, "category"),
            real_width_m: Number(val(d, "width").replace(",", ".")),
            real_depth_m: Number(val(d, "depth").replace(",", ".")),
            is_workplace: d.get("workplace") === "on",
            resize_allowed: d.get("resize") === "on",
            svg: f?.size ? await f.text() : null,
          });
        }}
      >
        <div className="form-row">
          <label>
            Название
            <input name="name" required maxLength={200} />
          </label>
          <label>
            Категория
            <select name="category">
              {Object.entries(furnitureCategories).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ширина, м
            <input
              name="width"
              inputMode="decimal"
              required
              placeholder="1,4"
            />
          </label>
          <label>
            Глубина, м
            <input
              name="depth"
              inputMode="decimal"
              required
              placeholder="0,7"
            />
          </label>
        </div>
        <label>
          Рисунок мебели, SVG
          <input name="svg" type="file" accept=".svg" />
        </label>
        <div className="inline-options">
          <label>
            <input type="checkbox" name="workplace" />
            Можно создать рабочее место
          </label>
          <label>
            <input type="checkbox" name="resize" defaultChecked />
            Разрешить изменение размеров
          </label>
        </div>
      </ActionForm></DrawerAction>
      <label>
        Найти тип мебели
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="library-grid">
        {templateGroups(list.data??[])
          .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
          .map((t) => (
            <article className="panel padded" key={t.id}>
              {t.svg && (
                <img
                  className="furniture-preview"
                  src={
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(t.svg)
                  }
                  alt=""
                />
              )}
              <h3>{t.name}</h3>{t.variantLabel&&<small>{t.variantLabel}</small>}{t.variants?.length>1&&<small>{t.variants.length} одинаковых исходных шаблонов · сгруппировано</small>}
              <p>{furnitureCategories[t.category]}</p>
              <p>
                {t.real_width_m
                  ? `${t.real_width_m} × ${t.real_depth_m} м`
                  : <StatusChip tone="review">Размер требует проверки</StatusChip>}
              </p>
              <button
                onClick={() => useUI.getState().set({ screen: "editor",pendingTemplate:t.id })}
              >
                Разместить на плане
              </button>
            </article>
          ))}
      </div>
    </>
  );
}
export function MapBooking({
  actor,
  selected,
  start,
  end,
  status,
}: {
  actor: Actor;
  selected: any;
  start: string;
  end: string;
  status?: string;
}) {
  const localTime=(hours:number)=>{const d=new Date(Date.now()+hours*3600000);d.setMinutes(0,0,0);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const [booked,setBooked]=useState(false),[open,setOpen]=useState(false),[from,setFrom]=useState(start||localTime(1)),[until,setUntil]=useState(end||localTime(3)),[q,setQ]=useState(''),[employee,setEmployee]=useState('');
  useEffect(()=>{if(start&&end){setFrom(start);setUntil(end);}},[start,end]);
  const valid=!!from&&!!until&&Date.parse(until)>Date.parse(from);
  const people=useFacility<any[]>('/search?q='+encodeURIComponent(q),actor.role!=='employee'&&q.trim().length>=2);
  const windows=useFacility<any[]>('/workplaces/'+selected.workplace_id+'/booking-windows',open);
  const conflict=valid&&windows.data?.some(b=>Date.parse(b.starts_at)<Date.parse(until)&&Date.parse(b.ends_at)>Date.parse(from));
  if(booked)return <section className="map-booking"><p role="status">Место забронировано.</p><button onClick={()=>useUI.getState().set({screen:'booking'})}>Мои бронирования</button></section>;
  if(selected.employee_id||selected.status==='disabled')return null;
  return <section className="map-booking"><button aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Закрыть бронирование':'Забронировать'}</button>{open&&<ActionForm title="Бронь на время" label="Подтвердить бронирование" disabled={!valid||!!conflict||(actor.role!=='employee'&&!employee)} successMessage="Место забронировано. Бронь находится в разделе «Бронирования»." submit={()=>api(actor.role==='employee'?'/me/bookings':'/bookings',{kind:'workplace',resourceId:selected.workplace_id,startsAt:new Date(from).toISOString(),endsAt:new Date(until).toISOString(),...(actor.role==='employee'?{}:{employeeId:employee})}).then(r=>{setBooked(true);return r;})}>
  <label>Начало<input type="datetime-local" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Окончание<input type="datetime-local" required min={from} value={until} onChange={e=>setUntil(e.target.value)}/></label>
  {actor.role!=='employee'&&<SearchSelect label="Сотрудник" value={employee} onChange={setEmployee} onSearch={setQ} options={(people.data??[]).map(e=>({id:e.id,label:e.display_name}))}/>}
  {valid&&<p role="status">{windows.isFetching?'Проверяем доступность…':conflict?'На это время уже есть бронь. Выберите другое время.':'Пересечений с бронями нет. Доступность повторно проверяется при сохранении.'}</p>}
  {from&&until&&!valid&&<p className="error">Окончание должно быть позже начала.</p>}
  {windows.error&&<p className="error">Не удалось загрузить бронирования. Повторите попытку.</p>}
  <details><summary>Предстоящие бронирования</summary>{windows.data?.length?windows.data.map((b,i)=><p key={i}>{new Date(b.starts_at).toLocaleString('ru')} — {new Date(b.ends_at).toLocaleString('ru')}</p>):<p>Броней пока нет.</p>}</details>
  </ActionForm>}</section>;
}

export function Calibration({
  floor,
  points,
  onPick,
  onCancel,
}: {
  floor: any;
  points: [number, number][];
  onPick: () => void;
  onCancel: () => void;
}) {
  const [result, setResult] = useState<any>(null),[distance,setDistance]=useState('');
  const planDistance=points.length===2?Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]):0;
  const candidateScale=planDistance>0?Number(distance.replace(',','.'))/planDistance:0;
  return (
    <section className="calibration-actions">
      <h3>Масштаб и площади</h3>
      <p>
        Укажите на плане две точки, расстояние между которыми известно по обмеру
        или документу. Площадь по документам не изменится.
      </p>
      <button onClick={onPick}>Выбрать две точки на карте</button>
      {points.length > 0 && <button onClick={onCancel}>Сбросить точки</button>}
      <p>Выбрано точек: {points.length} из 2</p>
      <ActionForm
        title="Контрольное расстояние"
        disabled={points.length !== 2}
        label="Подтвердить масштаб и рассчитать"
        submit={async (d) => {
          const r = await api("/floors/" + floor.id + "/calibration", {
            points,
            real_distance_m: Number(val(d, "distance").replace(",", ".")),
            source: val(d, "source"),
            expectedVersion: floor.version,
          });
          setResult(r);
          return r;
        }}
      >
        <div className="form-row">
          <label>
            Расстояние, м
            <input
              name="distance"
              required
              inputMode="decimal"
              placeholder="6,40" value={distance} onChange={e=>setDistance(e.target.value)}
            />
          </label>
          <label>
            Основание
            <input
              name="source"
              required
              minLength={5}
              placeholder="Обмер или название документа"
            />
          </label>
        </div>
        {candidateScale>0&&<p className="calibration-preview">Предварительный масштаб: <strong>{candidateScale.toPrecision(5)} м на единицу плана</strong>. После подтверждения пересчитаются площади помещений с пригодными контурами. Площади по документам сохранятся.</p>}
      </ActionForm>
      <ActionForm
        title="Обновление расчёта"
        label="Пересчитать площади этажа"
        disabled={
          !["confirmed_by_measurement", "confirmed_by_reviewer"].includes(
            floor.scale_evidence?.status,
          )
        }
        submit={async () => {
          const r = await api("/floors/" + floor.id + "/recalculate-areas", {
            expectedVersion: floor.version,
          });
          setResult(r);
          return r;
        }}
      >
        <small>Используется сохранённый подтверждённый масштаб.</small>
      </ActionForm>
      {result && (
        <DataTable
          rows={result.results}
          columns={[
            ["name", "Помещение"],
            ["official", "По документам, м²"],
            [
              "calculated",
              "По контуру, м²",
              (r) => r.calculated?.toFixed(2) ?? "—",
            ],
            [
              "difference",
              "Расхождение",
              (r) =>
                r.difference == null ? "—" : r.difference.toFixed(1) + "%",
            ],
            [
              "status",
              "Результат",
              (r) =>
                (
                  ({
                    ok: "Рассчитано",
                    review: "Сверить площади",
                    missing_geometry: "Нет контура",
                    invalid_polygon: "Некорректный контур",
                  }) as any
                )[r.status],
            ],
          ]}
        />
      )}
    </section>
  );
}
export function Leases() {
  const ui = useUI(),
    qc = useQueryClient(),
    [contractSearch,setContractSearch]=useState(''),
    [tab,setTab]=useState(ui.leaseExpiry?"expiring":"contracts"),
    [status, setStatus] = useState(ui.leaseExpiry?"expiring":""),
    [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10)),
    [selected, setSelected] = useState(ui.leaseId??""),
    [tenant, setTenant] = useState(ui.leaseDraft?.tenant??""),
    [roomIds, setRoomIds] = useState<string[]>(ui.leaseRooms ?? []),
    [commonIds, setCommonIds] = useState<string[]>(ui.leaseDraft?.commonIds??[]),
    [model, setModel] = useState(ui.leaseDraft?.model??"none"),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [roomQuery, setRoomQuery] = useState("");
  const tenants = useFacility<any[]>("/tenants"),
    list = useFacility<any[]>(
      "/leases?" + new URLSearchParams({ status, asOf,q:contractSearch }),
    ),
    detail = useFacility<any>("/leases/" + selected, !!selected),
    rooms = useFacility<any>("/dashboard");
  const all: any[] = rooms.data?.rooms ?? [];
  const pick = (id: string, common = false) => {
    setPreview(null);
    const setter = common ? setCommonIds : setRoomIds;
    setter((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  };
  return (
    <RegistryShell>
      <div className="toolbar-actions segmented">{[['contracts','Договоры'],['tenants','Арендаторы'],['expiring','Истекающие'],['rates','Тарифы']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setStatus(id==='expiring'?'expiring':'');}}>{label}</button>)}</div>
      <div className="toolbar-actions"><DrawerAction title="+ Арендатор">
        <ActionForm
          title="Арендатор"
          submit={(d) =>
            api("/tenants", {
              name: val(d, "name"),
              kind: val(d, "kind"),
              company_reference: val(d, "reference"),
            })
          }
        >
          <label>
            Название
            <input name="name" required />
          </label>
          <label>
            Тип
            <select name="kind">
              <option value="external">Внешняя организация</option>
              <option value="internal">Внутренняя организация</option>
            </select>
          </label>
          <label>
            Ссылка на организацию в учёте
            <input name="reference" />
          </label>
        </ActionForm>
      </DrawerAction><DrawerAction title="+ Новый договор" initialOpen={!!ui.leaseRooms?.length}>
        <form
          className="facility-form"
          onChange={(e) => {setPreview(null);ui.set({leaseDraft:{form:Object.fromEntries([...new FormData(e.currentTarget).entries()].map(([k,v])=>[k,String(v)])),tenant,model,commonIds}});}}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const d = new FormData(e.currentTarget);
            try {
              setPreview(
                await api("/leases/preview", {
                  tenant_id: tenant,
                  contract_number: val(d, "number"),
                  start_date: val(d, "start"),
                  end_date: val(d, "end"),
                  currency: val(d, "currency"),
                  room_ids: roomIds,
                  common_model: model,
                  common_room_ids: commonIds,
                  ...(model === "manual"
                    ? {
                        manual_area_m2: Number(
                          val(d, "manual").replace(",", "."),
                        ),
                        manual_floor_id: val(d, "floor"),
                      }
                    : {}),
                  office_rate: Number(val(d, "officeRate").replace(",", ".")),
                  common_rate: Number(val(d, "commonRate").replace(",", ".")),
                  comment: val(d, "comment"),
                }),
              );
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <SearchSelect
            label="Арендатор"
            placeholder="Выберите арендатора"
            value={tenant}
            onChange={setTenant}
            options={(tenants.data ?? []).map((t) => ({
              id: t.id,
              label: t.name,
            }))}
          />
          <div className="form-row">
            <label>
              Номер договора
              <input name="number" defaultValue={ui.leaseDraft?.form.number??''} required />
            </label>
            <label>
              С даты
              <input type="date" name="start" defaultValue={ui.leaseDraft?.form.start??''} required />
            </label>
            <label>
              До даты, не включая
              <input type="date" name="end" defaultValue={ui.leaseDraft?.form.end??''} required />
            </label>
            <label>
              Валюта
              <input
                name="currency"
                defaultValue={ui.leaseDraft?.form.currency??"RUB"}
                required
                pattern="[A-Z]{3}"
              />
            </label>
          </div>
          <button type="button" onClick={e=>{const form=e.currentTarget.form!;ui.set({leaseDraft:{form:Object.fromEntries([...new FormData(form).entries()].map(([k,v])=>[k,String(v)])),tenant,model,commonIds},leaseRooms:roomIds,leasePicking:true,screen:'floor'});}}>Выбрать помещения на карте</button>
          <label>
            Найти помещение
            <input
              value={roomQuery}
              onChange={(e) => setRoomQuery(e.target.value)}
            />
          </label>
          <div className="lease-room-picker">
            {all
              .filter(
                (r) =>
                  r.category === "OFFICE" &&
                  [r.name, r.building_name, r.floor_name]
                    .join(" ")
                    .toLowerCase()
                    .includes(roomQuery.toLowerCase()),
              )
              .map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    checked={roomIds.includes(r.id)}
                    onChange={() => pick(r.id)}
                  />
                  {r.building_name} · этаж {r.floor_name} · {r.name} ·{" "}
                  {r.official_area_m2 ?? "нет площади"} м²
                </label>
              ))}
          </div>
          <p>
            Выбрано офисных помещений: {roomIds.length}. Можно также добавить
            помещение из его карточки на карте.
          </p>
          <label>
            Общие площади
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="none">Только офисы</option>
              <option value="selected">Выбрать общие помещения</option>
              <option value="proportional">
                Доля по площади офисов на каждом этаже
              </option>
              <option value="manual">Площадь по договору</option>
            </select>
          </label>
          {model === "selected" && (
            <div className="lease-room-picker">
              {all
                .filter((r) => r.category === "COMMON")
                .map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      checked={commonIds.includes(r.id)}
                      onChange={() => pick(r.id, true)}
                    />
                    {r.building_name} · {r.floor_name} · {r.name}
                  </label>
                ))}
            </div>
          )}
          {model === "manual" && (
            <div className="form-row">
              <label>
                Общая площадь по договору, м²
                <input name="manual" defaultValue={ui.leaseDraft?.form.manual??''} required inputMode="decimal" />
              </label>
              <label>
                Этаж
                <select name="floor">
                  {[
                    ...new Set(
                      all
                        .filter((r) => roomIds.includes(r.id))
                        .map((r) => r.floor_id),
                    ),
                  ].map((id) => (
                    <option key={id} value={id}>
                      {all.find((r) => r.floor_id === id)?.building_name} ·{" "}
                      {all.find((r) => r.floor_id === id)?.floor_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="form-row">
            <label>
              Офисы: за м² / месяц
              <input name="officeRate" defaultValue={ui.leaseDraft?.form.officeRate??''} required inputMode="decimal" />
            </label>
            <label>
              Общие: за м² / месяц
              <input
                name="commonRate"
                required
                inputMode="decimal"
                defaultValue={ui.leaseDraft?.form.commonRate??"0"}
              />
            </label>
          </div>
          <label>
            Комментарий
            <textarea name="comment" defaultValue={ui.leaseDraft?.form.comment??""}/>
          </label>
          <button disabled={busy || !tenant || !roomIds.length}>
            Проверить и рассчитать
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {preview && (
          <section>
            <h3>Проверьте перед сохранением</h3>
            <p>
              Офисы: {preview.office_area} м² · Общие: {preview.common_area} м²
              · В месяц: {preview.monthly.toLocaleString("ru")}{" "}
              {preview.currency}
            </p>
            <DataTable
              rows={preview.lines}
              columns={[
                ["label", "Помещение / доля"],
                ["area_m2", "м²"],
                ["rate", "За м²"],
                ["monthly", "В месяц"],
              ]}
            />
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r: any = await api("/leases/apply", {
                    previewId: preview.previewId,
                  });
                  setSelected(r.id);
                  setPreview(null);
                  ui.set({ leaseRooms: [],leaseDraft:undefined,leasePicking:false });
                  qc.invalidateQueries();
                } catch (e) {
                  setError(String(e));
                  setPreview(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Подтвердить договор
            </button>
          </section>
        )}
      </DrawerAction></div>{tab==='tenants'&&<DataTable rows={tenants.data??[]} columns={[["name","Арендатор"],["kind","Тип",r=>r.kind==='external'?'Внешняя организация':'Внутренняя организация'],["company_reference","Номер в учёте"]]}/>}
      {tab==='rates'&&<section className="panel padded"><p>Ставки задаются в договоре отдельно для офисных и общих площадей. Откройте договор ниже, чтобы увидеть ставки или изменить их с новой даты.</p></section>}
      <div className="registry-toolbar"><label>Поиск договора<input placeholder="Номер или арендатор" value={contractSearch} onChange={e=>setContractSearch(e.target.value)}/></label>
        <label>
          Состояние
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все договоры</option>
            <option value="active">Действующие</option>
            <option value="expiring">Заканчиваются в течение 90 дней</option>
            <option value="expired">Завершённые</option>
            <option value="future">Будущие</option>
          </select>
        </label>
        <label>
          Расчёт на дату
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
      </div>
      <p>
        Даты окончания не включаются в период договора. Суммы — месячная плата
        по условиям на выбранную дату, без расчёта налогов и неполных месяцев.
      </p>
      <DataTable
        rows={list.data ?? []}
        columns={[
          [
            "contract_number",
            "Договор",
            (r) => (
              <button onClick={() => setSelected(r.id)}>
                {r.contract_number}
              </button>
            ),
          ],
          ["tenant_name", "Арендатор"],
          ["start_date", "С", (r) => date(r.start_date)],
          ["end_date", "До", (r) => date(r.end_date)],
          [
            "phase",
            "Состояние",
            (r) =>
              (
                ({
                  active: "Действует",
                  expiring: "Скоро окончание",
                  expired: "Завершён",
                  future: "Будущий",
                  cancelled: "Отменён",
                }) as any
              )[r.phase],
          ],
          [
            "monthly",
            "В месяц",
            (r) =>
              r.monthly == null
                ? "Не действует на эту дату"
                : Number(r.monthly).toLocaleString("ru") + " " + r.currency,
          ],
        ]}
      />
      {detail.data && (
        <DrawerAction key={selected} title={'Договор '+detail.data.contract_number} initialOpen>
          <h2>
            Договор {detail.data.contract_number} · {detail.data.tenant_name}
          </h2>
          <DataTable
            rows={detail.data.lines}
            columns={[
              [
                "label",
                "Помещение / доля",
                (r) =>
                  r.room_id ? (
                    <button
                      onClick={() =>
                        ui.set({
                          screen: "floor",
                          floorId: r.floor_id,
                          buildingId:
                            all.find((x) => x.id === r.room_id)?.building_id ??
                            ui.buildingId,
                          selected: r.room_id,
                        })
                      }
                    >
                      {r.label} · На карте
                    </button>
                  ) : (
                    r.label
                  ),
              ],
              ["area_m2", "Площадь для оплаты, м²"],
              ["rate", "За м² / месяц"],
              ["valid_from", "С", (r) => date(r.valid_from)],
              ["valid_to", "До", (r) => date(r.valid_to)],
            ]}
          />
          <details>
            <summary>Основание распределения общих площадей</summary>
            {detail.data.allocation_snapshot.map((a: any, i: number) => (
              <p key={i}>
                {a.formula === "manual"
                  ? `По договору: ${a.result} м²`
                  : `${a.common_area} м² общих × ${a.leased_office_area} м² арендуемых офисов / ${a.total_office_area} м² всех офисов = ${a.result} м²`}
              </p>
            ))}
          </details>
          <ActionForm
            title="Новые условия с даты"
            label="Сохранить новый период"
            submit={(d) =>
              api("/leases/" + selected + "/amend", {
                line_id: val(d, "line"),
                valid_from: val(d, "from"),
                area_m2: Number(val(d, "area").replace(",", ".")),
                rate: Number(val(d, "rate").replace(",", ".")),
                reason: val(d, "reason"),
              })
            }
          >
            <label>
              Строка договора
              <select name="line">
                {detail.data.lines.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.label} · {date(l.valid_from)} — {date(l.valid_to)}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                С даты
                <input name="from" type="date" required />
              </label>
              <label>
                Площадь для оплаты, м²
                <input name="area" required inputMode="decimal" />
              </label>
              <label>
                Тариф за м² в месяц
                <input name="rate" required inputMode="decimal" />
              </label>
            </div>
            <label>
              Основание
              <input name="reason" required minLength={5} />
            </label>
            <small>
              Предыдущие площадь и ставка сохраняются для исторических расчётов.
            </small>
          </ActionForm>
        </DrawerAction>
      )}
      
      
    </RegistryShell>
  );
}
export function ImportCenter() {
  const types = useFacility<any[]>("/import-center"),
    [kind, setKind] = useState(useUI.getState().importKind??"buildings"),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(""),
    qc = useQueryClient();
  const selected = types.data?.find((x) => x.kind === kind);
  return (
    <>
      <p>
        Загрузите CSV, проверьте ошибки и список изменений, затем примените. Все
        строки применяются одной операцией; при ошибке ничего не сохраняется.
      </p>
      <ol className="import-steps"><li>Тип данных</li><li>Шаблон и файл</li><li>Проверка и изменения</li><li>Применение</li></ol><section className="panel padded facility-form">
        <label>
          Что загрузить
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setError("");
              setPreview(null);
              setCsv("");
              setDone("");
            }}
          >
            {types.data?.map((t) => (
              <option key={t.kind} value={t.kind}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <p>{selected?.notes}</p>
        <button
          disabled={!selected}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(["\uFEFF" + selected.template], {
                type: "text/csv;charset=utf-8",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = kind + "-template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Скачать шаблон CSV
        </button>
        <small>Шаблон содержит только заголовки. Заполните от 1 до 500 строк данных под ними, сохраните файл в CSV и загрузите сюда.</small>
        <label className="csv-dropzone" onDragOver={e=>e.preventDefault()} onDrop={async e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(!f)return;if(!f.name.toLowerCase().endsWith('.csv')||f.size>500000){setError('Нужен CSV-файл до 500 КБ');return;}setPreview(null);setDone('');setError('');setCsv(await f.text());}}>
          Перетащите CSV сюда или нажмите, чтобы выбрать файл · до 500 строк
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              setPreview(null);
              setDone("");
              const f = e.target.files?.[0];
              if (f) {
                setError("");
                setCsv("");
                if (f.size > 500000) {
                  setError("Файл превышает 500 КБ");
                  return;
                }
                setCsv(await f.text());
              }
            }}
          />
        </label>
        {csv&&<p role="status">Файл загружен. Нажмите «Проверить» для просмотра ошибок и изменений.</p>}<details>
          <summary>Посмотреть / вставить CSV</summary>
          <textarea
            rows={8}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
          />
        </details>
        <button
          disabled={!csv || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            setDone("");
            try {
              setPreview(await api("/import-center/preview", { kind, csv }));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Проверить файл
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && <p role="status">{done}</p>}
      </section>
      {preview && (
        <>
          <DataTable
            rows={preview.errors}
            columns={[
              ["row", "Строка"],
              ["error", "Что исправить"],
            ]}
          />
          <DataTable
            rows={preview.changes}
            columns={[
              ["name", "Объект"],
              [
                "action",
                "Действие",
                (r) =>
                  (
                    ({
                      create: "Создать",
                      update: "Изменить",
                      unchanged: "Без изменений",
                    }) as any
                  )[r.action],
              ],
              [
                "diff",
                "Изменения",
                (r) => (
                  <dl>
                    {Object.entries(r.after)
                      .filter(
                        ([k, v]) =>
                          String(r.before?.[k] ?? "") !== String(v ?? ""),
                      )
                      .map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt>{k}</dt>
                          <dd>
                            {String(r.before?.[k] ?? "—")} →{" "}
                            {String(v ?? "неизвестно")}
                          </dd>
                        </React.Fragment>
                      ))}
                  </dl>
                ),
              ],
            ]}
          />
          <button
            className="primary"
            disabled={busy || !preview.previewId}
            onClick={async () => {
              setBusy(true);
              try {
                const r: any = await api("/import-center/apply", {
                  previewId: preview.previewId,
                });
                setDone(
                  `Применено: ${r.applied}. Без изменений: ${r.unchanged}.`,
                );
                setPreview(null);
                qc.invalidateQueries();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setPreview(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Применить проверенные изменения
          </button>
        </>
      )}
      <p>
        Для пространственной расстановки используйте редактор планировки. Импорт
        мебели требует проверенных координат и размеров. Тарифы договора
        меняются с новой даты в разделе «Аренда».
      </p>
    </>
  );
}
export function BuildingWizard() {
  const ui = useUI(),
    qc = useQueryClient(),
    [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [city, setCity] = useState(""),
    [address, setAddress] = useState(""),
    [floors, setFloors] = useState<any[]>([
      { name: "1", number: 1, width: 1200, height: 800, svg: null, rooms: [] },
    ]),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const types=useFacility<any[]>("/space-types");
  const update = (i: number, patch: any) => {
    setPreview(null);
    setFloors((old) => old.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  };
  return (
    <section className="panel padded" onChange={()=>setPreview(null)}>
      <h2>Новое здание</h2>
      <p>
        Шаг {step + 1} из 5 · {["Основное", "Этажи", "SVG планы", "Помещения", "Проверка"][step]}
      </p>
      {step === 0 && (
        <div className="facility-form">
          <label>
            Название
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Город
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            Адрес
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
        </div>
      )}
      {step === 1 && (
        <>
          <p>Добавьте этажи. Номера нужны для правильной сортировки.</p>
          {floors.map((f, i) => (
            <div className="form-row" key={i}>
              <label>
                Название этажа
                <input
                  value={f.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </label>
              <label>
                Порядковый номер
                <input
                  type="number"
                  value={f.number}
                  onChange={(e) =>
                    update(i, { number: Number(e.target.value) })
                  }
                />
              </label>
              <button
                disabled={floors.length === 1}
                onClick={() =>
                  setFloors((old) => old.filter((_, j) => j !== i))
                }
              >
                Убрать этаж
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setPreview(null);
              setFloors((old) => [
                ...old,
                {
                  name: String(old.length + 1),
                  number: old.length + 1,
                  width: 1200,
                  height: 800,
                  svg: null,
                  rooms: [],
                },
              ]);
            }}
          >
            Добавить этаж
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <p>
            Загрузите план для каждого этажа. Размеры чертежа берутся из viewBox
            SVG; физический масштаб настраивается отдельно на карте.
          </p>
          {floors.map((f, i) => (
            <div className="panel padded" key={i}>
              <h3>Этаж {f.name}</h3>
              <input
                aria-label={"План этажа " + f.name}
                type="file"
                accept=".svg"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 3000000) throw Error("План превышает 3 МБ");
                    const svg = await file.text(),
                      doc = new DOMParser().parseFromString(
                        svg,
                        "image/svg+xml",
                      ),
                      root = doc.documentElement;
                    const box = root
                      .getAttribute("viewBox")
                      ?.trim()
                      .split(/[ ,]+/)
                      .map(Number);
                    if (
                      !box ||
                      box.length !== 4 ||
                      box.some((n) => !Number.isFinite(n)) ||
                      box[0] !== 0 ||
                      box[1] !== 0 ||
                      box[2] <= 0 ||
                      box[3] <= 0
                    )
                      throw Error(
                        'Нужен SVG с viewBox="0 0 ширина высота". Проверьте экспорт плана.',
                      );
                    update(i, { svg, width: box[2], height: box[3] });
                    setError("");
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              />
              <p>
                {f.svg
                  ? "План загружен"
                  : "План не загружен — можно добавить позже"}
              </p>
            </div>
          ))}
        </>
      )}
      {step===3&&<div className="wizard-rooms"><p>Добавьте помещения по документам. Контуры и мебель размещаются на плане после создания здания.</p>{floors.map((f,i)=><section className="panel padded" key={i}><h3>Этаж {f.name}</h3>{f.rooms.map((r:any,j:number)=><div className="form-row" key={j}><label>Название<input value={r.name} onChange={e=>update(i,{rooms:f.rooms.map((x:any,k:number)=>k===j?{...x,name:e.target.value}:x)})}/></label><label>Назначение<select value={r.space_type_id} onChange={e=>update(i,{rooms:f.rooms.map((x:any,k:number)=>k===j?{...x,space_type_id:e.target.value}:x)})}><option value="">Выберите тип</option>{types.data?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>По документам, м²<input type="number" min="0" step="0.01" value={r.area_m2??''} onChange={e=>update(i,{rooms:f.rooms.map((x:any,k:number)=>k===j?{...x,area_m2:e.target.value===''?null:Number(e.target.value)}:x)})}/></label><button onClick={()=>update(i,{rooms:f.rooms.filter((_:any,k:number)=>k!==j)})}>Убрать</button></div>)}<button onClick={()=>update(i,{rooms:[...f.rooms,{name:'',space_type_id:'',area_m2:null}]})}>+ Помещение</button></section>)}</div>}
      {step === 4 && (
        <>
          <p>
            {name} · {city} · {address}
          </p>
          <p>
            Помещений: {floors.reduce((n,f)=>n+f.rooms.length,0)} · Этажей: {floors.length} · Планов:{" "}
            {floors.filter((f) => f.svg).length}
          </p>
          <p>
            После создания откройте редактор этажа: настройте масштаб, добавьте
            контуры помещений и мебель. Списки помещений можно загрузить через
            «Импорт данных».
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setPreview(
                  await api("/building-wizard/preview", {
                    name,
                    city,
                    address,
                    floors,
                  }),
                );
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Проверить перед созданием
          </button>
          {preview && (
            <button
              disabled={busy}
              className="primary"
              onClick={async () => {
                setBusy(true);
                try {
                  const r: any = await api("/building-wizard/apply", {
                    previewId: preview.previewId,
                  });
                  qc.invalidateQueries();
                  ui.set({
                    screen: "editor",
                    buildingId: r.id,
                    floorId: r.floors[0].id,
                  });
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Создать здание и открыть первый этаж
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="toolbar-actions">
        <button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Назад
        </button>
        <button
          disabled={
            step === 4 || !name.trim() || floors.some((f) => !f.name.trim())
          }
          onClick={() => setStep((s) => s + 1)}
        >
          Далее
        </button>
      </div>
    </section>
  );
}
export function RoomFacts({ id }: { id: string }) {
  const q = useFacility<any>("/rooms/" + id + "/summary");
  if (!q.data) return null;
  const r = q.data;
  const format = (v: any) =>
    v == null
      ? "Не указана"
      : Number(v).toLocaleString("ru", { maximumFractionDigits: 2 });
  return (
    <>
      <p>
        {r.building_name} · этаж {r.floor_name} ·{" "}
        {r.type_name ?? "Назначение не указано"}
      </p>
      <dl>
        <dt>По документам</dt>
        <dd>
          {format(r.area_m2)} {r.area_m2 != null ? "м²" : ""}
        </dd>
        <dt>По контуру</dt>
        <dd>
          {r.calculated_area_m2 == null
            ? "Нужны контур и масштаб"
            : format(r.calculated_area_m2) + " м²"}
        </dd>
        {Number(r.area_m2) > 0 && r.calculated_area_m2 != null && (
          <>
            <dt>Расхождение</dt>
            <dd>
              {(
                ((Number(r.calculated_area_m2) - Number(r.area_m2)) /
                  Number(r.area_m2)) *
                100
              ).toFixed(1)}
              %
            </dd>
          </>
        )}
        <dt>Сотрудников / мест</dt>
        <dd>
          {r.occupants} / {r.workplaces}
        </dd>
        <dt>Свободно сейчас</dt>
        <dd>{r.free}</dd>
        <dt>м² на сотрудника</dt>
        <dd>{r.area_per_person == null ? "—" : format(r.area_per_person)}</dd>
        <dt>м² на место</dt>
        <dd>
          {r.area_per_workplace == null ? "—" : format(r.area_per_workplace)}
        </dd>
        {r.responsible && (
          <>
            <dt>Ответственные</dt>
            <dd>
              {r.responsible.map((x: any) => x.display_name).join(", ") ||
                "Не назначены"}
            </dd>
          </>
        )}
      </dl>
    </>
  );
}
export function Spaces() {
  const ui = useUI(),
    [q, setQ] = useState(""),
    [building, setBuilding] = useState(""),
    [offset, setOffset] = useState(0),
    buildings = useFacility<any[]>("/buildings"),
    rows = useFacility<any[]>(
      "/spaces?" + new URLSearchParams({ q, building, offset: String(offset) }),
    );
  return (
    <>
      <div className="form-row">
        <label>
          Найти помещение
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          Здание
          <select
            value={building}
            onChange={(e) => {
              setBuilding(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все здания</option>
            {buildings.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DataTable
        rows={rows.data ?? []}
        columns={[
          ["building_name", "Здание"],
          ["floor_name", "Этаж"],
          [
            "name",
            "Помещение",
            (r) => (
              <button
                onClick={() =>
                  ui.set({
                    screen: "floor",
                    buildingId: r.building_id,
                    floorId: r.floor_id,
                    selected: r.id,
                  })
                }
              >
                {r.name} ↗
              </button>
            ),
          ],
          ["type_name", "Назначение"],
          ["area_m2", "По документам, м²"],
          [
            "calculated_area_m2",
            "По контуру, м²",
            (r) =>
              r.calculated_area_m2 == null
                ? "Нет расчёта"
                : Number(r.calculated_area_m2).toFixed(2),
          ],
          ["occupants", "Сотрудников"],
          ["workplaces", "Мест"],
          [
            "density",
            "м² / сотрудника",
            (r) =>
              r.occupants > 0 && (r.area_m2 ?? r.calculated_area_m2) != null
                ? (
                    Number(r.area_m2 ?? r.calculated_area_m2) / r.occupants
                  ).toFixed(1)
                : "—",
          ],
        ]}
      />
      <div className="toolbar-actions">
        <button
          disabled={!offset}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          Назад
        </button>
        <span>
          {offset + 1}–{offset + (rows.data?.length ?? 0)} из{" "}
          {rows.data?.[0]?.total_count ?? 0}
        </span>
        <button
          disabled={(rows.data?.length ?? 0) < 100}
          onClick={() => setOffset((n) => n + 100)}
        >
          Далее
        </button>
      </div>
    </>
  );
}
export function CorporateOverview() {
  const ui = useUI(),
    q = useFacility<any>("/dashboard"),
    leases = useFacility<any[]>("/leases?status=active"),
    expiring = useFacility<any[]>("/leases?status=expiring"),
    quality = useFacility<any>("/quality-queue?status=OPEN");
  const rooms = q.data?.rooms ?? [],
    total = rooms.reduce((s: number, r: any) => s + r.workplaces, 0),
    occupied = rooms.reduce((s: number, r: any) => s + r.occupants, 0);
  if(q.isPending)return <p role="status">Загружаем обзор…</p>;
  if(q.error)return <p className="error" role="alert">Не удалось загрузить обзор: {String(q.error)}</p>;
  const cards = [
    ["spaces", "Помещения", rooms.length],
    ["workplaces", "Рабочие места", q.data?.summary?.total_workplaces ?? "—"],
    [
      "workplaces",
      "Постоянно назначено",
      q.data?.summary?.total_occupied ?? "—",
    ],
    ["booking", "Брони сейчас", q.data?.summary?.active_bookings ?? "—"],
    ["quality", "Требуют проверки", quality.data?.total ?? "—"],
    ["leases", "Действующие договоры", leases.data?.length ?? 0],
  ];
  return (
    <>
      <h2>Сегодня и требует внимания</h2>
      <div className="overview-cards">
        {cards.map(([screen, label, value], i) => (
          <button
            key={i}
            className="panel padded"
            onClick={() => ui.set({ screen: screen as any })}
          >
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Открыть →</small>
          </button>
        ))}
      </div>
      <section className="panel padded">
        <h3>Договоры заканчиваются в течение 90 дней</h3>
        {expiring.data?.length ? (
          <DataTable
            rows={expiring.data}
            columns={[
              ["tenant_name", "Арендатор"],
              [
                "contract_number",
                "Договор",
                (r) => (
                  <button onClick={() => ui.set({ screen: "leases" })}>
                    {r.contract_number}
                  </button>
                ),
              ],
              ["days_left", "Дней до окончания"],
            ]}
          />
        ) : (
          <p>
            Таких договоров нет. Реестр аренды заполняется по данным компании.
          </p>
        )}
      </section>
      <div className="overview-cards">
        {[
          ["OFFICE", "Офисные площади"],
          ["COMMON", "Общие площади"],
          ["TECHNICAL", "Технические площади"],
        ].map(([category, label]) => {
          const selected = rooms.filter((r: any) => r.category === category),
            missing = selected.filter(
              (r: any) => r.effective_area_m2 == null,
            ).length;
          return (
            <button
              className="panel padded"
              key={category}
              onClick={() => ui.set({ screen: "spaces" })}
            >
              <span>{label}</span>
              <strong>
                {selected.length > 0 && missing === selected.length
                  ? "Нет данных"
                  : selected
                      .reduce(
                        (s: number, r: any) =>
                          s + Number(r.effective_area_m2 ?? 0),
                        0,
                      )
                      .toLocaleString("ru", { maximumFractionDigits: 1 }) +
                    " м²"}
              </strong>
              <small>
                {missing
                  ? `${missing} помещений без площади — итог неполный`
                  : "По внесённым данным"}
              </small>
            </button>
          );
        })}
      </div>
      <p>
        Постоянные назначения, временные брони и отсутствие данных учитываются
        отдельно. Стоимость и условия аренды доступны в соответствующих
        разделах.
      </p>
    </>
  );
}
