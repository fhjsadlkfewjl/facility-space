import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUI } from "./store";
import { useFacility } from "./facility";
import { placeLabel as importedPlaceLabel } from "./display";
export function employeePlaceLabel(code:unknown){const label=importedPlaceLabel(code);return /^\d{1,6}$/.test(label)?`Место ${label}`:label;}
const placeLabel=employeePlaceLabel;
import type { Actor } from "@office/shared";
export type Interval = { start: string; end: string };
export const localStamp = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export function defaultInterval(): Interval {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const e = new Date(d);
  e.setHours(18);
  return { start: localStamp(d), end: localStamp(e) };
}
export const floorLabel = (v: string) =>
  /этаж|цоколь|подвал|мансарда/i.test(v) ? v : `${v} этаж`;
export const locationLabel = (r: any) =>
  [
    r.building_name,
    r.floor_name && floorLabel(r.floor_name),
    r.room_name && `кабинет ${r.room_name}`,
  ]
    .filter(Boolean)
    .join(" · ");
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
export function intervalLabel(i: Interval) {
  return (
    new Date(i.start).toLocaleString("ru", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) +
    " — " +
    new Date(i.end).toLocaleString("ru", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}
function readInterval(d: FormData): Interval {
  const start = `${d.get("day")}T${d.get("from")}`,
    end = `${d.get("endDay") || d.get("day")}T${d.get("until")}`;
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    throw Error("Окончание должно быть позже начала.");
  if (Date.parse(start) < Date.now() - 60000)
    throw Error("Выберите время в будущем.");
  if (Date.parse(end) - Date.parse(start) > 90 * 86400000)
    throw Error("Бронь может длиться до 90 дней.");
  return { start, end };
}
function TimeFields({ initial }: { initial: Interval }) {
  const [multi,setMulti]=useState(initial.start.slice(0,10)!==initial.end.slice(0,10));
  return (
    <div className="employee-times">
      <label>
        Дата
        <input
          type="date"
          name="day"
          required
          defaultValue={initial.start.slice(0, 10)}
        />
      </label>
      <label>
        С
        <input
          type="time"
          name="from"
          required
          defaultValue={initial.start.slice(11, 16)}
        />
      </label>
      <label>
        До
        <input
          type="time"
          name="until"
          required
          defaultValue={initial.end.slice(11, 16)}
        />
      </label>
      <label className="multi-day-switch"><input type="checkbox" checked={multi} onChange={e=>setMulti(e.target.checked)}/>Несколько дней</label>
      {multi&&<label className="end-day">Дата окончания<input type="date" name="endDay" required defaultValue={initial.end.slice(0,10)}/></label>}

    </div>
  );
}
export function EmployeeBooking({
  desk,
  initial,
  onDone,
}: {
  desk: any;
  initial?: Interval;
  onDone: () => void;
}) {
  const qc = useQueryClient(),
    [period, setPeriod] = useState(initial ?? defaultInterval()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const windows = useFacility<any[]>(
    "/workplaces/" + desk.workplace_id + "/booking-windows",
  );
  const conflict = windows.data?.find(
    (b) =>
      Date.parse(b.starts_at) < Date.parse(period.end) &&
      Date.parse(b.ends_at) > Date.parse(period.start),
  );
  if (done)
    return (
      <section className="employee-booking">
        <span className="success-mark">✓</span>
        <h2>Бронирование создано</h2>
        <p>{placeLabel(desk.code)}</p>
        <p>{intervalLabel(period)}</p>
        <button className="primary" onClick={onDone}>
          Готово
        </button>
        <button
          onClick={() =>
            useUI.getState().set({ screen: "booking", bookingSearch: false })
          }
        >
          Мои бронирования
        </button>
      </section>
    );
  return (
    <section className="employee-booking">
      <button className="text-button" onClick={onDone}>
        ← Назад
      </button>
      <h2>Забронировать {placeLabel(desk.code).toLowerCase()}</h2>
      <form
        onChange={(e) => {
          try {
            setPeriod(readInterval(new FormData(e.currentTarget)));
            setError("");
          } catch {}
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const interval = readInterval(new FormData(e.currentTarget));
            setPeriod(interval);
            await api("/me/bookings", {
              kind: "workplace",
              resourceId: desk.workplace_id,
              startsAt: new Date(interval.start).toISOString(),
              endsAt: new Date(interval.end).toISOString(),
            });
            setDone(true);
            qc.invalidateQueries();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{locationLabel(desk)}</p>
        <TimeFields initial={period} />
        <p className={conflict ? "booking-conflict" : "availability-note"}>
          {windows.isPending
            ? "Проверяем время…"
            : conflict
              ? "Место занято: " +
                new Date(conflict.starts_at).toLocaleString("ru") +
                " — " +
                new Date(conflict.ends_at).toLocaleString("ru")
              : "На выбранное время броней нет"}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Сохраняем…" : "Забронировать"}
        </button>
      </form>
    </section>
  );
}
export function EmployeeInspector({
  actor,
  desk,
  room,
  furniture,
  building,
  floor,
  freeRoom,
  onFreeRoom,
  availability,
}: {
  actor: Actor;
  desk: any;
  room: any;
  furniture: any[];
  building: string;
  floor: string;
  freeRoom: string | null;
  onFreeRoom: (id: string | null) => void;
  availability?: any[];
}) {
  const ui = useUI(),
    qc = useQueryClient(),
    [booking, setBooking] = useState(!!ui.bookingDesk),
    [pending, setPending] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setBooking(!!ui.bookingDesk);
    setPending(null);
    setError("");
  }, [desk?.id, room?.id, ui.bookingDesk]);
  const own = desk?.employee_id === actor.employeeId;
  const windows=useFacility<any[]>('/workplaces/'+desk?.workplace_id+'/booking-windows',!!desk?.workplace_id);
  const restrictions=windows.data??[];
  const currentBooking=restrictions.find(b=>Date.parse(b.starts_at)<=Date.now()&&Date.parse(b.ends_at)>Date.now());
  const nextBooking=restrictions.find(b=>Date.parse(b.starts_at)>Date.now());
  const onlyOwn=restrictions.length>0&&restrictions.every(b=>b.is_mine&&!b.has_other);
  const canAssign=windows.isSuccess&&restrictions.length===0&&!desk?.reserved;

  const location = [
    building,
    floorLabel(floor),
    room?.name && `кабинет ${room.name}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const submit = async (kind: "assign" | "release", current: any) => {
    setBusy(true);
    setError("");
    try {
      await api(
        kind === "release" ? "/me/workplace/release" : "/me/workplace",
        kind === "release"
          ? { expectedAssignmentId: desk.assignment_id }
          : {
              workplaceId: desk.workplace_id,
              expectedAssignmentId: current?.assignment_id ?? null,
              confirmMove: !!current,
            },
      );
      setPending(null);
      await qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!desk && !room)
    return (
      <div className="employee-inspector-empty">
        <h2>Выберите место</h2>
        <p>Нажмите на человека, стол или кабинет на карте.</p>
      </div>
    );
  if (booking && desk)
    return (
      <EmployeeBooking
        key={desk.workplace_id}
        desk={{
          ...desk,
          building_name: building,
          floor_name: floor,
          room_name: room?.name,
        }}
        initial={ui.bookingInterval}
        onDone={() => {
          setBooking(false);
          ui.set({ bookingDesk: false });
        }}
      />
    );
  const occupied = desk?.employee_id && !own,
    desks = room
      ? furniture.filter((f) => f.room_id === room.id && f.workplace_id)
      : [];
  const free = (f: any) =>
    availability
      ? availability.find((a) => a.furniture_id === f.id)?.status ===
        "available"
      : !f.employee_id && !f.reserved && f.status !== "disabled";
  return (
    <div className="employee-inspector-content">
      <button
        className="inspector-close"
        aria-label="Закрыть карточку"
        onClick={() => ui.set({ selected: null, bookingDesk: false })}
      >
        ×
      </button>
      {desk ? (
        <>
          {occupied && (
            <span className="person-initials">
              {initials(desk.display_name ?? "")}
            </span>
          )}
          <h2>{occupied ? desk.display_name : placeLabel(desk.code)}</h2>
          {occupied && (
            <>
              <p className="person-position">{desk.position || ""}</p>
              <p>{desk.department_name}</p>
            </>
          )}
          <span
            className={
              "employee-state " +
              (own
                ? "own"
                : desk.employee_id
                  ? "occupied"
                  : desk.reserved
                    ? "booked"
                    : "free")
            }
          >
            {own
              ? "Моё рабочее место"
              : desk.employee_id
                ? "Занято"
                : desk.reserved
                  ? "Забронировано"
                  : desk.status === "disabled"
                    ? "Недоступно"
                    : nextBooking ? "Свободно сейчас" : "Свободно"}
          </span>
          {!desk.employee_id&&<>
            {windows.isPending&&<p>Проверяем бронирования…</p>}
            {windows.error&&<p role="alert">Не удалось проверить бронирования. Обновите карточку перед назначением.</p>}
            {restrictions.length>0&&<div className="booking-restriction"><strong>{currentBooking?'Бронь на это время':'Нельзя занять постоянно'}</strong><p>{onlyOwn?(currentBooking?'У вас есть текущая бронь этого места.':'У вас есть будущие бронирования этого места.'):(currentBooking?'Место забронировано на это время.':'Для этого места уже есть будущие бронирования.')}</p>{(currentBooking||nextBooking)&&<p>{currentBooking?'Текущая бронь: ':'Следующая бронь: '}{intervalLabel({start:(currentBooking||nextBooking).starts_at,end:(currentBooking||nextBooking).ends_at})}</p>}{onlyOwn&&<><p>Сначала отмените свои бронирования, если хотите занять место постоянно.</p><button onClick={()=>ui.set({screen:'booking'})}>Мои бронирования</button></>}</div>}
          </>}
          <p className="employee-location">{location}</p>
          {occupied && <small>{placeLabel(desk.code)}</small>}
          {!desk.employee_id && desk.status !== "disabled" && (
            <div className="employee-primary-actions">
              {canAssign && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const current = await api("/me/workplace");
                      if (current) setPending({ kind: "assign", current });
                      else await submit("assign", null);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Занять
                </button>
              )}
              <button onClick={() => setBooking(true)}>{restrictions.length?"Забронировать другое время":"Забронировать"}</button>
            </div>
          )}
          {own && (
            <button onClick={() => setPending({ kind: "release" })}>
              Освободить место
            </button>
          )}
        </>
      ) : (
        <>
          <span className="eyebrow">Помещение</span>
          <h2>Кабинет {room.name}</h2>
          <p>
            {building} · {floorLabel(floor)}
          </p>
          <div className="room-occupancy">
            <span>
              <strong>{desks.length}</strong>мест
            </span>
            <span>
              <strong>{desks.filter((f) => !free(f)).length}</strong>занято
            </span>
            <span>
              <strong>{desks.filter(free).length}</strong>свободно
            </span>
          </div>
          <button
            className="primary"
            disabled={!desks.some(free)}
            onClick={() => onFreeRoom(freeRoom === room.id ? null : room.id)}
          >
            {freeRoom === room.id
              ? "Показать все места"
              : "Показать свободные места"}
          </button>

        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {pending && (
        <div className="employee-modal-shade">
          <section role="dialog" aria-modal="true" className="employee-confirm">
            <h2>
              {pending.kind === "release"
                ? `Освободить ${placeLabel(desk.code).toLowerCase()}?`
                : "Перенести рабочее место?"}
            </h2>
            {pending.kind === "assign" && (
              <>
                <small>Сейчас</small>
                <p>
                  {locationLabel(pending.current)} ·{" "}
                  {placeLabel(pending.current.code)}
                </p>
                <small>Новое</small>
                <p>
                  {location} · {placeLabel(desk.code)}
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="employee-primary-actions">
              <button disabled={busy} onClick={() => setPending(null)}>
                Отмена
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => submit(pending.kind, pending.current)}
              >
                {busy
                  ? "Сохраняем…"
                  : pending.kind === "release"
                    ? "Освободить"
                    : "Перенести"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function DirectBooking({desk,interval,onBack}:{desk:any;interval:Interval;onBack:()=>void}){
 const qc=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 return <section className="direct-booking"><h2>{done?'Бронирование создано':'Забронировать '+(placeLabel(desk.code)==='Рабочее место'?'свободное место':placeLabel(desk.code))+'?'}</h2><p>{locationLabel(desk)}</p><p>{intervalLabel(interval)}</p>{error&&<p className="error" role="alert">{error}</p>}<div className="employee-primary-actions"><button disabled={busy} onClick={onBack}>{done?'Готово':'Отмена'}</button>{!done&&<button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/me/bookings',{kind:'workplace',resourceId:desk.id,startsAt:new Date(interval.start).toISOString(),endsAt:new Date(interval.end).toISOString()});setDone(true);qc.invalidateQueries();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Сохраняем…':'Забронировать'}</button>}</div></section>;
}
export function AvailabilitySearch({ onClose }: { onClose: () => void }) {
  const ui = useUI(),
    [building, setBuilding] = useState(""),
    [floor, setFloor] = useState(""),
    [submitted, setSubmitted] = useState<Interval | null>(null),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState<any>(null),
    [limit, setLimit] = useState(40);
  const buildings = useFacility<any[]>("/buildings"),
    floors = useFacility<any[]>(
      "/floors" +
        (building ? "?buildingId=" + encodeURIComponent(building) : ""),
    );
  const results = useFacility<any[]>(
    "/availability?" +
      new URLSearchParams({
        kind: "workplace",
        building,
        ...(submitted
          ? {
              startsAt: new Date(submitted.start).toISOString(),
              endsAt: new Date(submitted.end).toISOString(),
            }
          : {}),
      }),
    !!submitted,
  );
  const rows = (results.data ?? []).filter(
    (r) => !floor || r.floor_id === floor,
  ).sort((a,b)=>String(a.building_name).localeCompare(String(b.building_name),'ru')||String(a.floor_name).localeCompare(String(b.floor_name),'ru',{numeric:true})||String(a.code).localeCompare(String(b.code),'ru',{numeric:true}));
  const groups = new Map<string, any>();
  for (const r of results.data ?? []) {
    if (!groups.has(r.building_id))
      groups.set(r.building_id, {
        name: r.building_name,
        rows: [],
        floors: new Map(),
      });
    const g = groups.get(r.building_id);
    g.rows.push(r);
    const fg = g.floors.get(r.floor_id) ?? { name: r.floor_name, rows: [] };
    fg.rows.push(r);
    g.floors.set(r.floor_id, fg);
  }
  const showMap = (r: any) => {
    ui.set({
      screen: "floor",
      buildingId: r.building_id,
      floorId: r.floor_id,
      selected: r.furniture_id,
      bookingInterval: submitted!,
      bookingDesk: true,
    });
    onClose();
  };
  return (
    <div className="employee-modal-shade">
      <section
        className="availability-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Забронировать место"
      >
        <header>
          <div>
            <h2>Забронировать место</h2>
            <p>Выберите время. Офис и этаж можно не указывать.</p>
          </div>
          <button aria-label="Закрыть поиск мест" onClick={onClose}>
            ×
          </button>
        </header>
        {chosen ? (
          <DirectBooking desk={chosen} interval={submitted!} onBack={()=>setChosen(null)}/>
        ) : (
          <>
            <form
              className="availability-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  setSubmitted(readInterval(new FormData(e.currentTarget)));
                  setError("");
                  setLimit(40);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <TimeFields initial={ui.bookingInterval ?? defaultInterval()} />
              <div className="availability-location">
                <label>
                  Офис
                  <select
                    value={building}
                    onChange={(e) => {
                      setBuilding(e.target.value);
                      setFloor("");
                      setLimit(40);
                    }}
                  >
                    <option value="">Любой офис</option>
                    {buildings.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Этаж
                  <select
                    value={floor}
                    onChange={(e) => {
                      setFloor(e.target.value);
                      setLimit(40);
                    }}
                  >
                    <option value="">Любой этаж</option>
                    {floors.data
                      ?.filter(
                        (f) =>
                          buildings.data?.some((b) => b.id === f.building_id) &&
                          (!building || f.building_id === building),
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {!building
                            ? buildings.data?.find(
                                (b) => b.id === f.building_id,
                              )?.name + " · "
                            : ""}
                          {floorLabel(f.name)}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="primary">Показать свободные</button>
              </div>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {results.error && <p className="error">{String(results.error)}</p>}
            {submitted && (
              <section className="availability-results" aria-live="polite">
                {results.isFetching ? (
                  <p>Ищем свободные места…</p>
                ) : (
                  <>
                    <div className="availability-result-header">
                      <div><h3>{floor?floorLabel(floors.data?.find(f=>f.id===floor)?.name):building?buildings.data?.find(b=>b.id===building)?.name:"Все офисы"}</h3><span>{rows.length} свободных мест{!floor?" на всех этажах":""}</span></div>
                      <span>{intervalLabel(submitted)}</span>

                    </div>
                    {!rows.length && (
                      <p>
                        На это время мест не найдено. Попробуйте другой офис или
                        время.
                      </p>
                    )}
                    <div className="availability-result-layout"><div className="availability-group-summary">
                      {floor&&<button onClick={()=>{setFloor("");setLimit(40);}}>Все этажи</button>}
                      {[...groups.entries()].map(([id, g]) => (
                        <section key={id}>
                          <strong>
                            {g.name} · {g.rows.length} свободно во всём здании
                          </strong>
                          <div>
                            {[...g.floors.entries()]
                              .sort((a: any, b: any) =>
                                String(a[1].name).localeCompare(
                                  String(b[1].name),
                                  "ru",
                                  { numeric: true },
                                ),
                              )
                              .map(([fid, fg]: any) => (
                                <button
                                  key={fid}
                                  aria-pressed={floor===fid}
                                  onClick={() => {
                                    setBuilding(id);
                                    setFloor(floor===fid?"":fid);
                                    setLimit(40);
                                  }}
                                >
                                  {floorLabel(fg.name)} — {fg.rows.length}
                                </button>
                              ))}
                          </div>
                        </section>
                      ))}
                    </div>
                    <div className="availability-desks">
                      {rows.slice(0, limit).map((r,index,visible) => (
                        <React.Fragment key={r.id}>
                        {(index===0||visible[index-1].floor_id!==r.floor_id)&&<h4>{r.building_name} · {floorLabel(r.floor_name)}</h4>}
                        <article key={r.id}>
                          <div>
                            <strong>{placeLabel(r.code)==="Рабочее место"?"Свободное место":placeLabel(r.code)}</strong>
                            <p>{r.room_name?`Кабинет ${r.room_name}`:"Помещение не указано"}</p>
                          </div>
                          <div>
                            <button onClick={() => showMap(r)}>На карте</button>
                            <button
                              className="primary"
                              onClick={() => setChosen(r)}
                            >
                              Забронировать
                            </button>
                          </div>
                        </article></React.Fragment>
                      ))}
                    </div></div>
                    {rows.length > limit && (
                      <button onClick={() => setLimit((n) => n + 40)}>
                        Показать ещё 40
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}
export function MyBookings() {
  const ui = useUI(),
    qc = useQueryClient(),
    [tab, setTab] = useState("today"),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(""),
    [cancel, setCancel] = useState<any>(null);
  const bookings = useFacility<any[]>(
    "/bookings?" +
      new URLSearchParams({
        status: tab === "today" ? "" : tab === "past" ? "past" : "future",
        offset: String(offset),
      }),
  );
  const today = localStamp(new Date()).slice(0, 10),
    rows = (bookings.data ?? []).filter(
      (b) =>
        tab !== "today" ||
        (localStamp(new Date(b.starts_at)).slice(0, 10) <= today &&
          localStamp(new Date(b.ends_at)).slice(0, 10) >= today),
    );
  return (
    <>
      {cancel && (
        <div className="employee-modal-shade">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Отменить бронирование"
            className="employee-confirm"
          >
            <h2>Отменить бронирование?</h2>
            <p>
              {placeLabel(cancel.resource_name)} · {locationLabel(cancel)}
            </p>
            <p>
              {intervalLabel({ start: cancel.starts_at, end: cancel.ends_at })}
            </p>
            {error && <p className="error">{error}</p>}
            <div className="employee-primary-actions">
              <button disabled={!!busy} onClick={() => setCancel(null)}>
                Оставить бронь
              </button>
              <button
                className="primary"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(cancel.id);
                  setError("");
                  try {
                    await api("/bookings/" + cancel.id + "/cancel", {});
                    await qc.invalidateQueries();
                    setCancel(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Отменить бронирование
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="employee-booking-tabs">
        {[
          ["today", "Сегодня"],
          ["future", "Будущие"],
          ["past", "Прошедшие"],
        ].map(([id, label]) => (
          <button
            aria-pressed={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              setOffset(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {bookings.isPending ? (
        <p>Загружаем бронирования…</p>
      ) : bookings.error ? (
        <p className="error">Не удалось загрузить бронирования.</p>
      ) : !rows.length ? (
        <div className="employee-empty">
          <h2>{tab==="today"?"Сегодня бронирований нет":tab==="future"?"Будущих бронирований нет":"История бронирований пуста"}</h2>
          <p>Найдите свободное место на нужное время.</p>
          <button
            className="primary"
            onClick={() => ui.set({ bookingSearch: true })}
          >
            Забронировать место
          </button>
        </div>
      ) : (
        <div className="my-booking-list">
          {rows.map((b) => (
            <article key={b.id} className={b.status==="cancelled"?"booking-cancelled":undefined}>
              <div>
                <h3>{placeLabel(b.resource_name)}</h3>
                <p>{locationLabel(b)}</p>
                <p>{intervalLabel({ start: b.starts_at, end: b.ends_at })}</p>
                {b.status === "cancelled" && <small>Отменено</small>}
              </div>
              <div>
                {b.floor_id && b.status==="confirmed" && Date.parse(b.ends_at)>Date.now() && (
                  <button
                    onClick={() =>
                      ui.set({
                        screen: "floor",
                        buildingId: b.building_id,
                        floorId: b.floor_id,
                        selected: b.furniture_id,
                        bookingDesk: false,
                        bookingInterval:
                          Date.parse(b.ends_at) > Date.now()
                            ? {
                                start: localStamp(new Date(b.starts_at)),
                                end: localStamp(new Date(b.ends_at)),
                              }
                            : undefined,
                      })
                    }
                  >
                    На карте
                  </button>
                )}
                {b.status === "confirmed" &&
                  Date.parse(b.ends_at) > Date.now() && (
                    <button
                      disabled={busy === b.id}
                      onClick={() => setCancel(b)}
                    >
                      Отменить
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
      {(offset > 0 || (bookings.data?.length ?? 0) === 200) && (
        <div>
          <button
            disabled={!offset}
            onClick={() => setOffset((n) => Math.max(0, n - 200))}
          >
            Назад
          </button>
          <button
            disabled={(bookings.data?.length ?? 0) < 200}
            onClick={() => setOffset((n) => n + 200)}
          >
            Далее
          </button>
        </div>
      )}
    </>
  );
}
