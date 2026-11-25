import {DrawerAction,RegistryShell,StatusChip,templateGroups,TemplatePreview} from './workspace-ui';
import { placeLabel } from './display';
import { SearchSelect } from './search-select';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, demo } from './api';
import { useUI } from './store';
import type { Actor, Layout, Furniture } from '@office/shared';
const subtypeLabels: Record<string, string> = {
  office: 'Кабинет',
  open_space: 'Открытый офис',
  meeting_room: 'Переговорная',
  corridor: 'Коридор',
  restroom: 'Санузел',
  kitchen: 'Кухня',
  break_room: 'Комната отдыха',
  lobby: 'Холл',
  storage: 'Склад',
  server_room: 'Серверная',
  technical: 'Техническое помещение',
  parking: 'Парковка',
  outdoor: 'Открытая территория',
  other: 'Другое',
};
const classLabels: Record<string, string> = {
  OFFICE: 'Офисные',
  COMMON: 'Общие',
  TECHNICAL: 'Технические',
  OTHER: 'Другие',
};
const qualityLabels: Record<string, string> = {
  missing_official_area: 'Нет учётной площади',
  missing_calculated_area: 'Площадь по контуру не рассчитана: проверьте контур и масштаб',
  area_mismatch: 'Площади расходятся',
  unclassified: 'Требует классификации',
};
export function useFacility<T = any>(path: string, enabled = true) {
  const s = useUI();
  return useQuery<T>({
    queryKey: ['facility', path, s.demoRole, s.token],
    queryFn: () => api<T>(path),
    enabled,
  });
}
function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function ActionForm({
  title,
  children,
  submit,
  label = 'Сохранить',
  disabled = false,
  successMessage = 'Сохранено',
}: {
  title: string;
  children: React.ReactNode;
  submit: (d: FormData) => Promise<any>;
  label?: string;
  disabled?: boolean;
  successMessage?: React.ReactNode;
}) {
  const [preview,setPreview]=useState<{data:FormData;fields:{label:string;value:string}[]}|null>(null);
  const qc = useQueryClient(),
    m = useMutation({ mutationFn: submit, onSuccess: () => qc.invalidateQueries() });
  return (
    <form
      className="panel padded facility-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data=new FormData(e.currentTarget);
        const fields=Array.from(e.currentTarget.elements).filter((x:any)=>x.name&&x.type!=='hidden'&&x.type!=='password').map((x:any)=>({label:Array.from(x.labels?.[0]?.childNodes??[]).filter((n:any)=>n.nodeType===3).map((n:any)=>n.textContent).join(' ').trim()||x.getAttribute('aria-label')||x.name,value:x.tagName==='SELECT'?x.selectedOptions[0]?.text:x.type==='checkbox'?(x.checked?'Да':'Нет'):x.value}));
        setPreview({data,fields});
      }}
    >
      <h3>{title}</h3>
      {preview&&<div className="control-shade confirmation-shade"><section className="control-confirm" role="dialog" aria-modal="true" aria-label="Подтверждение изменений"><h2>{title}</h2><p>Проверьте значения перед сохранением.</p><dl>{preview.fields.map((field,i)=><React.Fragment key={i}><dt>{field.label}</dt><dd>{field.value||'Не указано'}</dd></React.Fragment>)}</dl><ErrorNotice error={m.error}/><div className="toolbar-actions"><button type="button" disabled={m.isPending} onClick={()=>setPreview(null)}>Вернуться</button><button type="button" className="primary" disabled={m.isPending} onClick={()=>m.mutate(preview.data,{onSuccess:()=>setPreview(null)})}>{m.isPending?'Сохраняем…':'Подтвердить'}</button></div></section></div>}
      {children}
      <ErrorNotice error={m.error} />
      {m.isSuccess && (
        <p role="status" className="green">
          {successMessage}
        </p>
      )}
      <button className="primary" disabled={m.isPending || disabled}>
        {m.isPending ? 'Сохраняем…' : label}
      </button>
    </form>
  );
}
const val = (d: FormData, k: string) => String(d.get(k) ?? '');
const n = (d: FormData, k: string) => Number(d.get(k));
function Input({
  label,
  name,
  type = 'text',
  value,
  required = true,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        step={step ?? (type === 'number' ? 'any' : undefined)}
      />
    </label>
  );
}
function Select({
  label,
  name,
  rows,
  value,
  blank = false,
}: {
  label: string;
  name: string;
  rows: any[];
  value?: string;
  blank?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        key={(value ?? '') + rows.map((r) => r.id).join(',')}
        name={name}
        defaultValue={value}
        required={!blank}
      >
        {blank && <option value="">Не выбрано</option>}
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name ?? r.display_name ?? r.code ?? r.number}
          </option>
        ))}
      </select>
    </label>
  );
}
export function DataTable({
  rows,
  columns, selectedId, onRowClick,
}: {
  selectedId?:string; onRowClick?:(row:any)=>void;
  rows: any[];
  columns: [string, string, ((row: any) => React.ReactNode)?][];
}) {
  const activeObject=useUI(s=>s.selected);
  const [page, setPage] = useState(0);
  const [sort,setSort]=useState<{key:string,desc:boolean}|null>(null);
  const sorted=sort?[...rows].sort((a,b)=>{const x=a[sort.key],y=b[sort.key];const n=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'ru',{numeric:true});return sort.desc?-n:n;}):rows;
  const fingerprint = rows.map((r) => r.id ?? r.sourceId ?? r.name).join('|');
  useEffect(() => setPage(0), [fingerprint]);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  return (
    <div className="panel table-scroll">
      {rows.length > 50 && (
        <div className="pagination">
          <button type="button" disabled={!current} onClick={() => setPage(current - 1)}>
            Предыдущие 50
          </button>
          <span>
            {current * 50 + 1}–{Math.min((current + 1) * 50, rows.length)} из {rows.length}
          </span>
          <button
            type="button"
            disabled={(current + 1) * 50 >= rows.length}
            onClick={() => setPage(current + 1)}
          >
            Следующие 50
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k} aria-sort={sort?.key===k?(sort.desc?"descending":"ascending"):"none"}><button type="button" onClick={()=>{setSort({key:k,desc:sort?.key===k&&!sort.desc});setPage(0);}}>{l}{sort?.key===k?(sort.desc?" ↓":" ↑"):""}</button></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(current * 50, (current + 1) * 50).map((r, i) => (
            <tr key={(r.category??'')+(r.id??i)} className={(selectedId??activeObject)===r.id||activeObject&&activeObject===r.furniture_id?"selected-row":undefined} tabIndex={onRowClick?0:undefined} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onRowClick?.(r);}}} onClick={e=>{if(!(e.target as HTMLElement).closest("button,input,select,summary,a"))onRowClick?.(r);}} style={onRowClick?{cursor:"pointer"}:undefined}>
              {columns.map(([k, , render]) => (
                <td key={k}>{render ? render(r) : String(r[k] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">Пока нет данных</p>}
    </div>
  );
}
async function download(kind: string) {
  const s = useUI.getState(),
    token = demo ? `${import.meta.env.VITE_DEMO_TOKEN}:${s.demoRole}` : s.token;
  const r = await fetch('/api/reports/' + kind + '.csv', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw new Error('Не удалось выгрузить отчёт');
  const url = URL.createObjectURL(await r.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = kind + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
export function Dashboard() {
  const quality = useFacility('/data-quality'),
    q = useFacility('/dashboard'),
    costs = useFacility<any[]>('/costs'),
    parking = useFacility<any[]>('/parking-costs'),
    [building, setBuilding] = useState(''),
    [floorFilter, setFloorFilter] = useState(''),
    [classFilter, setClassFilter] = useState(''),
    [subtypeFilter, setSubtypeFilter] = useState(''),
    [roomQuery,setRoomQuery]=useState(''),
    [error, setError] = useState<unknown>(null);
  const all = q.data?.rooms ?? [],
    rooms = all.filter(
      (r: any) =>
        (!roomQuery || [r.name,r.building_name,r.floor_name].join(' ').toLowerCase().includes(roomQuery.toLowerCase())) &&
        (!building || r.building_id === building) &&
        (!floorFilter || r.floor_id === floorFilter) &&
        (!classFilter || r.category === classFilter) &&
        (!subtypeFilter || r.subtype === subtypeFilter),
    ),
    sum = (k: string) => rooms.reduce((a: number, r: any) => a + Number(r[k] ?? 0), 0),
    area = sum('effective_area_m2'),
    people = sum('occupants'),
    seats = sum('workplaces');
  const missingArea = rooms.filter((r: any) => r.effective_area_m2 == null).length;
  const visibleFloors = (q.data?.floors ?? []).filter((f: any) => !building || all.some((r: any) => r.floor_id === f.id && r.building_id === building)).sort((a: any, b: any) => a.building_name.localeCompare(b.building_name, 'ru') || a.floor_name.localeCompare(b.floor_name, 'ru', {numeric:true}));
  const buildings = [
    ...new Map<string, string>(all.map((r: any) => [r.building_id, r.building_name])).entries(),
  ];
  const totals = new Map<string, number>();
  for (const c of costs.data ?? []) {
    if (!rooms.some((r: any) => r.id === c.id) || c.total_cost === null) continue;
    const k = `${c.currency} / ${c.period === 'month' ? 'месяц' : 'год'}`;
    totals.set(k, (totals.get(k) ?? 0) + Number(c.total_cost));
  }
  const floorCosts = new Map<string, any>();
  for (const c of costs.data ?? []) {
    if (!rooms.some((r: any) => r.id === c.id)) continue;
    const key = [c.floor_id, c.currency ?? 'unknown', c.period ?? 'unknown'].join('|');
    const g = floorCosts.get(key) ?? {
      id: key,
      building_name: c.building_name,
      floor_name: c.floor_name,
      currency: c.currency,
      period: c.period,
      total: 0,
      missing: 0,
      occupants: 0,
      area: 0,
    };
    if (c.total_cost === null) g.missing++;
    else {
      g.total += Number(c.total_cost);
      g.area += Number(c.area_m2 ?? 0);
      g.occupants += Number(c.occupants ?? 0);
    }
    floorCosts.set(key, g);
  }
  if (q.isPending) return <p role="status">Загружаем аналитику помещений…</p>;
  return (
    <>
      <ErrorNotice error={q.error || costs.error || parking.error || error} />
      <UnifiedFacilitySearch/>
      <details className="panel padded"><summary>Данные, которые нужно проверить</summary><QualityQueue/></details>
      <RoomCsvImport/>
      <div className="summary-panel">
        <div>
          <span className="eyebrow">FACILITY MANAGEMENT</span>
          <h2>Пространство под контролем</h2>
          <p>Площади, размещение и затраты для команды АХО</p>
        </div>
        <label>
          Здание
          <select value={building} onChange={(e) => { setBuilding(e.target.value); setFloorFilter(''); }}>
            <option value="">Все здания</option>
            {buildings.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="section-heading">
        <label>
          Этаж
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}>
            <option value="">Все этажи</option>
            {visibleFloors.map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.building_name} / {f.floor_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Класс
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Все классы</option>
            {['OFFICE', 'COMMON', 'TECHNICAL', 'OTHER'].map((c) => (
              <option key={c} value={c}>
                {subtypeLabels[c] ?? classLabels[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Подтип
          <select value={subtypeFilter} onChange={(e) => setSubtypeFilter(e.target.value)}>
            <option value="">Все подтипы</option>
            {[
              'office',
              'open_space',
              'meeting_room',
              'corridor',
              'restroom',
              'kitchen',
              'break_room',
              'lobby',
              'storage',
              'server_room',
              'technical',
              'parking',
              'outdoor',
              'other',
            ].map((c) => (
              <option key={c} value={c}>
                {subtypeLabels[c] ?? classLabels[c] ?? c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        В выбранных помещениях площадь известна для {rooms.length - missingArea} из {rooms.length}; не указана для {missingArea}.
        {missingArea > 0 ? ' Сумма ниже неполная. Общий показатель м² на сотрудника не рассчитывается, пока не заполнены площади всех выбранных помещений.' : ' Площади всех выбранных помещений заполнены.'}
      </p>
      <div className="stats">
        <Metric
          label={missingArea ? "Известная площадь (неполная)" : "Площадь помещений"}
          value={area.toLocaleString('ru', { maximumFractionDigits: 1 }) + ' м²'}
        />
        <Metric label="Рабочих мест в комнатах" value={seats} />
        <Metric label="Постоянно размещено" value={people} />
        <Metric label="м² на размещённого сотрудника" value={!missingArea && people ? (area / people).toFixed(1) : '—'} />
      </div>
      <p>м²/сотрудника = площадь ÷ число размещённых сотрудников; м²/место = площадь ÷ число рабочих мест, включая свободные. Значения совпадают только при полной занятости мест.</p>
      <div className="admin-grid">
        <section className="panel padded">
          <h3>Известная площадь по назначению помещений</h3><p>Класс задаётся типом каждой комнаты. Тип можно изменить в разделе «Площади и стоимость» → «Параметры помещения» или массово через CSV; площади сгруппируются автоматически. Комнаты без площади в сумму не входят.</p>
          {[
            ['OFFICE', 'Офисные'],
            ['COMMON', 'Общие'],
            ['TECHNICAL', 'Технические'],
            ['OTHER', 'Другие'],
          ].map(([k, l]) => {
            const a = rooms
              .filter((r: any) => r.category === k)
              .reduce((a: number, r: any) => a + Number(r.effective_area_m2 ?? 0), 0);
            return (
              <div className="area-bar" key={k}>
                <span>{l}</span>
                <strong>{a.toFixed(1)} м²</strong>
                <progress value={a} max={area || 1} />
              </div>
            );
          })}
          <small>
            Приоритет: учётная площадь, затем расчёт по контуру. Без масштаба расчёт не выполняется.
          </small>
        </section>
        <section className="panel padded">
          <h3>Стоимость помещений</h3>
          {[...totals].map(([k, v]) => (
            <p className="cost-total" key={k}>
              {v.toLocaleString('ru')} <small>{k}</small>
            </p>
          ))}
          <p>
            Стоимость не рассчитана (нет площади или подходящего тарифа):{' '}
            {
              rooms.filter(
                (r: any) => !costs.data?.some((c) => c.id === r.id && c.total_cost !== null),
              ).length
            }{' '}
            помещений
          </p>
          <h3>Парковка</h3>
          {parking.data
            ?.filter((r) => !building || r.building_id === building)
            .map((r) => (
              <p key={r.building_id}>
                {r.building_name}: {r.spots} мест ·{' '}
                {r.monthly_cost === null
                  ? 'Тариф не задан'
                  : Number(r.monthly_cost).toLocaleString('ru') + ' ' + r.currency + ' / месяц'}
              </p>
            ))}
        </section>
      </div>
      <details className="panel padded">
        <summary>Справка о переносе: что требует сверки с исходными данными</summary>
        <ErrorNotice error={quality.error} />
        <p>
          Этот раздел объясняет ограничения переноса. Предполагаемые размеры мебели и масштаб плана не являются подтверждёнными обмерами. АХО проверяет размеры и площади по документам или обмеру; ИТ предоставляет названия подразделений для записей, где сохранился только идентификатор. Эти предположения не подменяют подтверждённые площади.
        </p>
        <DataTable
          rows={quality.data?.quarantine ?? []}
          columns={[
            ['reason', 'Что нужно проверить', (r) => legacyReason(r.reason)],
            ['count', 'Записей'],
          ]}
        />
        <DataTable
          rows={quality.data?.floors ?? []}
          columns={[
            ['building_name', 'Здание'],
            ['name', 'Этаж'],
            ['has_svg', 'SVG', (r) => (r.has_svg ? 'Загружен' : 'Нет файла')],
            ['meters_per_unit', 'Масштаб, м/ед.'],
            [
              'candidate',
              'Гипотеза',
              (r) => r.scale_evidence?.candidate?.toPrecision(5) ?? 'Нет данных',
            ],
            [
              'confidence',
              'Уверенность',
              (r) =>
                ({ medium: 'Средняя', low: 'Низкая', none: 'Нет данных' })[
                  r.scale_evidence?.confidence as string
                ] ?? 'Нет данных',
            ],
          ]}
        />
        <DataTable
          rows={quality.data?.templates ?? []}
          columns={[
            ['name', 'Шаблон'],
            ['default_width', 'Ширина-гипотеза, м'],
            ['default_depth', 'Глубина-гипотеза, м'],
            [
              'source',
              'Источник',
              (r) =>
                r.dimensions_evidence?.status === 'inferred'
                  ? 'Название, низкая уверенность'
                  : 'Не восстановлен',
            ],
          ]}
        />
      </details>
      <details className="panel padded">
        <summary>Расчёт стоимости помещений по этажам</summary><p>Для расчёта нужны площадь помещения и действующий тариф. Суммы за месяц и за год, а также разные валюты показаны отдельно: складывать их напрямую нельзя. Прочерк означает отсутствие расчёта, а не бесплатное помещение.</p>
        <DataTable
          rows={[...floorCosts.values()]}
          columns={[
            ['building_name', 'Здание'],
            ['floor_name', 'Этаж'],
            ['currency', 'Валюта'],
            ['period', 'Период', r => r.period === 'month' ? 'Месяц' : r.period === 'year' ? 'Год' : 'Не задан'],
            ['total', 'Учтённая стоимость', (r) => (r.currency ? Number(r.total).toFixed(2) : '—')],
            ['missing', 'Без расчёта'],
            [
              'per_person',
              'На сотрудника',
              (r) => (r.occupants ? (r.total / r.occupants).toFixed(2) : '—'),
            ],
            ['per_m2', 'На м²', (r) => (r.area ? (r.total / r.area).toFixed(2) : '—')],
          ]}
        />
      </details>
      <details className="panel padded">
        <summary>Сводка по этажам: учтённые площади и полнота данных</summary>
        <DataTable
          rows={(q.data?.floors ?? []).filter(
            (f: any) =>
              !building || all.some((r: any) => r.floor_id === f.id && r.building_id === building),
          )}
          columns={[
            ['building_name', 'Здание'],
            ['floor_name', 'Этаж'],
            ['rooms', 'Помещений'],
            ['official_area_m2', 'Учётная, м²'],
            ['calculated_area_m2', 'По контурам, м²'],
            ['missing_official', 'Без учётной площади'],
            ['missing_calculated', 'Без расчётной площади'],
            ['occupants', 'Сотрудников'],
            ['workplaces', 'Мест'],
          ]}
        />
      </details>
      <div className="section-heading">
        <h2>Аналитика помещений</h2><label>Поиск помещений<input value={roomQuery} onChange={e=>setRoomQuery(e.target.value)} placeholder="Здание, этаж или помещение"/></label>
        <button onClick={() => download('rooms').catch(setError)}>Скачать CSV</button>
      </div>
      <DataTable
        rows={rooms}
        columns={[
          ['building_name', 'Здание'],
          ['floor_name', 'Этаж'],
          ['name', 'Помещение',r=><button onClick={()=>openFacilityResult({...r,kind:'room'})}>{r.name} · На карте</button>],
          ['category','Класс'],
          ['workplaces','Рабочих мест'],
          ['cost','Стоимость',r=>{const c=costs.data?.find(c=>c.id===r.id);return c?.total_cost==null?'Не задана':`${c.total_cost} ${c.currency} / ${c.period}`;}],
          ['type_name', 'Тип'],
          ['subtype', 'Подтип', (r) => subtypeLabels[r.subtype] ?? r.subtype],
          [
            'flags',
            'Качество данных',
            (r) => r.flags?.map((f: string) => qualityLabels[f] ?? f).join(', ') || '—',
          ],
          ['official_area_m2', 'Учётная, м²'],
          [
            'calculated_area_m2',
            'По контуру, м²',
            (r) => (r.calculated_area_m2 === null ? '—' : Number(r.calculated_area_m2).toFixed(2)),
          ],
          ['occupants', 'Сотрудников'],
          [
            'density',
            'м² / сотрудника',
            (r) =>
              r.occupants && r.effective_area_m2 !== null
                ? (Number(r.effective_area_m2) / r.occupants).toFixed(1)
                : '—',
          ],
          [
            'perseat',
            'м² / место',
            (r) =>
              r.workplaces && r.effective_area_m2 !== null
                ? (Number(r.effective_area_m2) / r.workplaces).toFixed(1)
                : '—',
          ],
        ]}
      />
    </>
  );
}
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function BookingPage({ actor }: { actor: Actor }) {
  const [registryQuery,setRegistryQuery]=useState(''),[registryBuilding,setRegistryBuilding]=useState(''),[registryFloor,setRegistryFloor]=useState(''),[registryDate,setRegistryDate]=useState('');
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [building, setBuilding] = useState(''),
    buildings = useFacility<any[]>('/buildings'),
    validWindow =
      !!start &&
      !!end &&
      Date.parse(end) > Date.parse(start) &&
      Date.parse(start) > Date.now() - 60000 &&
      Date.parse(end) - Date.parse(start) <= 90 * 86400000,
    [kind, setKind] = useState('workplace'),
    [statusFilter, setStatusFilter] = useState(''),
    [q, setQ] = useState(''),
    [employee,setEmployee] = useState(''),
    [offset, setOffset] = useState(0),
    resources = useFacility<any[]>(
      validWindow
        ? '/availability?' +
            new URLSearchParams({
              kind,
              startsAt: new Date(start).toISOString(),
              endsAt: new Date(end).toISOString(),
              building,
            })
        : '/availability',
      validWindow,
    ),
    employees = useFacility<any[]>('/search?q=' + encodeURIComponent(q), actor.role !== 'employee' && q.trim().length>=2),
    list = useFacility<any[]>(
      '/bookings?' + new URLSearchParams({ offset: String(offset), status: statusFilter,q:registryQuery,building:registryBuilding,floor:registryFloor,date:registryDate }),
    ),
    qc = useQueryClient(),
    cancel = useMutation({
      mutationFn: (id: string) => api('/bookings/' + id + '/cancel', {}),
      onSuccess: () => qc.invalidateQueries(),
    });
  return (
    <RegistryShell>
      <div className="toolbar-actions"><button onClick={()=>useUI.getState().set({screen:'floor'})}>Выбрать место на карте</button></div><DrawerAction title="+ Бронирование">
        <ActionForm
          title="Новое бронирование"
          disabled={
            !validWindow || resources.isFetching || !resources.data?.length || !!resources.error || (actor.role !== 'employee' && !employee)
          }
          label="Забронировать"
          submit={(d) =>
            api(actor.role==='employee'?'/me/bookings':'/bookings', {
              kind,
              resourceId: val(d, 'resource'),
              ...(actor.role === 'employee' ? {} : {employeeId:employee}),
              startsAt: new Date(val(d, 'start')).toISOString(),
              endsAt: new Date(val(d, 'end')).toISOString(),
              vehicle: val(d, 'vehicle'),
            })
          }
        >
          <label>
            Ресурс
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="workplace">Рабочее место</option>
              <option value="parking">Парковка</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Начало
              <input
                name="start"
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Окончание
              <input
                name="end"
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <label>
            Здание
            <select value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">Все здания</option>
              {buildings.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <Select
            key={kind + start + end + building}
            label="Место"
            name="resource"
            rows={(resources.data ?? []).map((r) => ({
              ...r,
              name: [r.building_name, r.floor_name, r.room_name, r.zone, r.code]
                .filter(Boolean)
                .join(' / '),
            }))}
          />
          <p role="status">
            {!validWindow
              ? 'Выберите начало и окончание в будущем, не более 90 дней.'
              : resources.isFetching
                ? 'Проверяем доступность…'
                : resources.error
                  ? 'Не удалось проверить доступность.'
                  : resources.data?.length
                    ? `Свободно в выбранный период: ${resources.data.length}`
                    : 'На выбранный период свободных мест нет.'}
          </p>
          {actor.role !== 'employee' && <><SearchSelect label="Сотрудник" value={employee} onChange={setEmployee} onSearch={setQ} minimum={2} loading={employees.isFetching} placeholder="Имя или подразделение" options={(employees.data??[]).map(e=>({id:e.id,label:e.display_name,detail:e.position||undefined}))}/><ErrorNotice error={employees.error}/></>}

          {kind === 'parking' && (
            <Input label="Автомобиль / номер" name="vehicle" required={false} />
          )}
          <small>Даты и время указываются по часам вашего устройства.</small>
        </ActionForm>
      </DrawerAction>
      <div className="registry-toolbar"><label>Сотрудник или место<input value={registryQuery} onChange={e=>{setRegistryQuery(e.target.value);setOffset(0);}}/></label><label>Здание<select value={registryBuilding} onChange={e=>{setRegistryBuilding(e.target.value);setRegistryFloor('');setOffset(0);}}><option value="">Все здания</option>{buildings.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Этаж<input placeholder="Номер или название" value={registryFloor} onChange={e=>{setRegistryFloor(e.target.value);setOffset(0);}}/></label><label>Дата<input type="date" value={registryDate} onChange={e=>{setRegistryDate(e.target.value);setOffset(0);}}/></label></div><label>
        Брони
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Все</option>
          <option value="future">Действующие и будущие</option>
          <option value="past">Прошедшие</option>
          <option value="cancelled">Отменённые</option>
        </select>
      </label>
      <ErrorNotice error={list.error || resources.error || cancel.error} />
      <DataTable
        rows={list.data ?? []}
        columns={[
          ['resource_name', 'Место',r=>r.workplace_id?placeLabel(r.resource_name):'Парковка · '+r.resource_name],['location','Расположение',r=>[r.building_name,r.floor_name&&('этаж '+r.floor_name),r.room_name&&('помещение '+r.room_name)].filter(Boolean).join(' · ')],
          ['display_name', 'Сотрудник'],['map','',r=>r.floor_id&&<button onClick={()=>openFacilityResult({...r,kind:'workplace'})}>На карте</button>],
          ['starts_at', 'Начало', (r) => new Date(r.starts_at).toLocaleString('ru')],
          ['ends_at', 'Конец', (r) => new Date(r.ends_at).toLocaleString('ru')],
          ['vehicle', 'Автомобиль'],
          [
            'status',
            'Статус',
            (r) =>
              r.status === 'cancelled'
                ? 'Отменено'
                : Date.parse(r.ends_at) <= Date.now()
                  ? 'Завершено'
                  : 'Подтверждено',
          ],
          [
            'action',
            '',
            (r) =>
              r.status === 'confirmed' &&
              Date.parse(r.ends_at) > Date.now() && (
                <DrawerAction title="Отменить бронь"><ActionForm title={placeLabel(r.resource_name)+' · '+r.display_name} label="Отменить бронь" submit={()=>cancel.mutateAsync(r.id)}><p>{new Date(r.starts_at).toLocaleString('ru')} — {new Date(r.ends_at).toLocaleString('ru')}</p></ActionForm></DrawerAction>
              ),
          ],
        ]}
      />
      <div className="pagination">
        <button disabled={!offset} onClick={() => setOffset(offset - 200)}>
          Назад
        </button>
        <button disabled={(list.data?.length ?? 0) < 200} onClick={() => setOffset(offset + 200)}>
          Далее
        </button>
      </div>
    </RegistryShell>
  );
}
export function Inventory() {
  const [checked,setChecked]=useState<string[]>([]);
  const [q, setQ] = useState(''),
    [offset, setOffset] = useState(0),
    [building, setBuilding] = useState(''),
    [condition, setCondition] = useState(''),
    [unchecked, setUnchecked] = useState(false),
    [quality, setQuality] = useState(''),
    [floor, setFloor] = useState(''),
    [room, setRoom] = useState(''),
    catalog = useFacility('/dashboard'),
    buildings = useFacility<any[]>('/buildings'),
    list = useFacility<any[]>(
      '/inventory?' +
        new URLSearchParams({id:useUI.getState().registryFocus?.screen==='inventory'?useUI.getState().registryFocus!.id:'',
          q,
          offset: String(offset),
          building,
          condition,
          unchecked: unchecked ? 'yes' : '',
          quality,
          floor,
          room,
        }),
    ),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState<unknown>(null);
  useEffect(()=>{const focus=useUI.getState().registryFocus;if(focus?.screen==='inventory'&&list.data){const row=list.data.find(r=>r.id===focus.id);if(row)setSelected(row);useUI.getState().set({registryFocus:undefined});}},[list.data]);
  useEffect(()=>setChecked([]),[q,offset,building,condition,unchecked,quality,floor,room]);
  return (
    <RegistryShell>
      <div className="registry-toolbar">
        <label>
          Номер, мебель или помещение
          <input
            placeholder="Например, D-001"
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
              setFloor('');
              setRoom('');
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
        <label>
          Этаж
          <select
            value={floor}
            onChange={(e) => {
              setFloor(e.target.value);
              setRoom('');
              setOffset(0);
            }}
          >
            <option value="">Все этажи</option>
            {(catalog.data?.floors ?? [])
              .filter(
                (f: any) =>
                  !building ||
                  (catalog.data?.rooms ?? []).some(
                    (r: any) => r.floor_id === f.id && r.building_id === building,
                  ),
              )
              .map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.building_name} / {f.floor_name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Помещение
          <select
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все помещения</option>
            {(catalog.data?.rooms ?? [])
              .filter(
                (r: any) =>
                  (!building || r.building_id === building) && (!floor || r.floor_id === floor),
              )
              .map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.floor_name} / {r.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Состояние
          <select
            value={condition}
            onChange={(e) => {
              setCondition(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все</option>
            <option value="in_use">Используется</option>
            <option value="stored">На хранении</option>
            <option value="repair">В ремонте</option>
            <option value="retired">Списано</option>
          </select>
        </label>
        <button className={unchecked?"active filter-chip":"filter-chip"} aria-pressed={unchecked} onClick={()=>{setUnchecked(!unchecked);setOffset(0);}}>Непроверенные</button>
<DrawerAction title="Фильтры">        <label>
          Инвентарные номера
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все</option>
            <option value="missing">Отсутствуют</option>
            <option value="duplicate">Повторяются</option>
          </select>
        </label>
</DrawerAction>        <button onClick={() => download('inventory').catch(setError)}>CSV всего реестра</button>
      </div>
      <ErrorNotice error={list.error || error} />
      {checked.length>0&&<div className="sticky-bulk"><strong>Выбрано: {checked.length}</strong> <DrawerAction title="Массовая проверка"><ActionForm title={'Массовая проверка: выбрано '+checked.length} disabled={!checked.length} label="Подтвердить выбранные" submit={async d=>{await api('/inventory/bulk-check',{ids:checked,condition:val(d,'bulkCondition'),note:val(d,'bulkNote')});setChecked([]);}}>
        <button type="button" onClick={()=>setChecked((list.data??[]).map(r=>r.id))}>Выбрать текущую страницу</button><button type="button" onClick={()=>setChecked([])}>Снять выбор</button>
        <Select label="Состояние выбранных" name="bulkCondition" rows={[{id:'in_use',name:'Используется'},{id:'stored',name:'На хранении'},{id:'repair',name:'В ремонте'},{id:'retired',name:'Списано'}]}/>
        <Input label="Общее примечание" name="bulkNote" required={false}/>
      </ActionForm></DrawerAction></div>}
      {selected && (<div className="control-shade"><section className="control-drawer" role="dialog" aria-modal="true" aria-label="Проверка инвентаря"><button className="drawer-close" onClick={()=>setSelected(null)}>Закрыть</button><p>{selected.building_name} · этаж {selected.floor_name} · {selected.room_name}</p><h2>{selected.template_name}</h2><p>Последняя проверка: {selected.checked_at?new Date(selected.checked_at).toLocaleString('ru'):'ещё не проводилась'}</p><div className="toolbar-actions"><button onClick={()=>openFacilityResult({...selected,kind:'furniture'})}>На карте</button><button onClick={()=>{openFacilityResult({...selected,kind:'furniture'});useUI.getState().set({screen:'editor'});}}>Переместить на плане</button><button onClick={()=>useUI.getState().set({screen:'history',historyQuery:selected.id})}>История</button></div>
        <ActionForm
          key={selected.id}
          title={'Проверка: ' + (selected.inventory_number ?? selected.template_name)}
          label="Подтвердить проверку"
          submit={async (d) => {
            await api(
              '/inventory/' + selected.id,
              {
                inventory_number: val(d, 'number') || null,
                condition: val(d, 'condition'),
                note: val(d, 'note'),
              },
              'PATCH',
            );
            setSelected(null);
          }}
        >
          <Input
            label="Инвентарный номер"
            name="number"
            value={selected.inventory_number}
            required={false}
          />
          <Select
            label="Состояние"
            name="condition"
            value={selected.condition}
            rows={[
              { id: 'in_use', name: 'Используется' },
              { id: 'stored', name: 'На хранении' },
              { id: 'repair', name: 'В ремонте' },
              { id: 'retired', name: 'Списано' },
            ]}
          />
          <Input label="Примечание" name="note" value={selected.inventory_note} required={false} />
          <button type="button" onClick={() => setSelected(null)}>
            Закрыть
          </button>
        </ActionForm></section></div>
      )}
      <DataTable onRowClick={r=>setSelected(r)}
        rows={list.data ?? []}
        columns={[
          ['selection','Выбор',r=><input type="checkbox" aria-label={'Выбрать '+r.id} checked={checked.includes(r.id)} onChange={e=>setChecked(e.target.checked?[...checked,r.id]:checked.filter(id=>id!==r.id))}/>],
          ['inventory_number', 'Инвентарный №'],
          ['template_name', 'Мебель'],
          ['building_name', 'Здание'],
          ['floor_name', 'Этаж'],
          ['room_name', 'Помещение'],
          [
            'condition',
            'Состояние',
            (r) =>
              ({
                in_use: 'Используется',
                stored: 'На хранении',
                repair: 'Ремонт',
                retired: 'Списано',
              })[r.condition as string],
          ],
          [
            'checked_at',
            'Проверено',
            (r) =>
              r.checked_at ? new Date(r.checked_at).toLocaleDateString('ru') : 'Не проверено',
          ],
          ['active', 'На плане', (r) => (r.active ? 'Да' : 'Архив')],
          ['action', '', (r) => <details className="row-menu"><summary>⋯</summary><div><button onClick={() => setSelected(r)}>Проверить</button><button onClick={()=>openFacilityResult({...r,kind:'furniture'})}>На карте</button><button onClick={()=>useUI.getState().set({screen:'history',historyQuery:r.id})}>История</button></div></details>],
        ]}
      />
      <div className="pagination">
        <button disabled={!offset} onClick={() => setOffset(offset - 200)}>
          Назад
        </button>
        <button disabled={(list.data?.length ?? 0) < 200} onClick={() => setOffset(offset + 200)}>
          Далее
        </button>
      </div>
    </RegistryShell>
  );
}
export function Catalog({ actor, section="settings" }: { actor: Actor; section?:"settings"|"building"|"room" }) {
  const buildings = useFacility<any[]>('/buildings'),
    floors = useFacility<any[]>('/floors'),
    types = useFacility<any[]>('/space-types'),
    [floor, setFloor] = useState(''),
    [building, setBuilding] = useState(useUI.getState().buildingId);
  return (
    <div className="catalog-grid">{section==="settings"&&<><h2>Типы помещений</h2><p>Справочник назначения помещений для карты, площадей и отчётов.</p><DataTable rows={types.data??[]} columns={[["name","Название"],["category","Класс",r=>classLabels[r.category]??r.category]]}/></>}
      {section==="building"&&<DrawerAction title="Данные здания"><ActionForm title="Данные здания"
        submit={(d) =>
          api(
            '/buildings/' + building,
            { name: val(d, 'name'), city: val(d, 'city'), address: val(d, 'address') },
            'PATCH',
          )
        }
      >
        <label>
          Здание
          <select value={building} onChange={(e) => setBuilding(e.target.value)} required>
            <option value="">Выберите</option>
            {buildings.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div key={building}>
          <Input
            label="Название"
            name="name"
            value={buildings.data?.find((b) => b.id === building)?.name}
          />
          <Input
            label="Город"
            name="city"
            value={buildings.data?.find((b) => b.id === building)?.city}
          />
          <Input
            label="Адрес"
            name="address"
            value={buildings.data?.find((b) => b.id === building)?.address}
          />
        </div>
      </ActionForm></DrawerAction>}
      {section==="building"&&<DrawerAction title="Новый этаж"><ActionForm title="Новый этаж"
        submit={(d) =>
          api('/floors', {
            building_id: val(d, 'building'),
            name: val(d, 'name'),
            number: n(d, 'number'),
            width: n(d, 'width'),
            height: n(d, 'height'),
            meters_per_unit: val(d, 'scale') ? n(d, 'scale') : null,
          })
        }
      >
        <Select label="Здание" name="building" rows={buildings.data ?? []} value={building} />
        <Input label="Название этажа" name="name" />
        <div className="form-row">
          <Input label="Номер этажа" name="number" type="number" step="1" />
          <Input label="Ширина плана" name="width" type="number" value={1200} />
          <Input label="Высота плана" name="height" type="number" value={800} />
        </div>
        <Input
          label="Метров в единице плана (если известно)"
          name="scale"
          type="number"
          required={false}
        />
      </ActionForm></DrawerAction>}
      {section==="settings"&&<DrawerAction title="Тип помещения"><ActionForm title="Тип помещения"
        submit={(d) =>
          api('/space-types', {
            id: val(d, 'id'),
            name: val(d, 'name'),
            category: val(d, 'category'),
          })
        }
      >
        <Input label="Код латиницей" name="id" />
        <Input label="Название" name="name" />
        <Select
          label="Класс"
          name="category"
          rows={[
            { id: 'OFFICE', name: 'Офисное' },
            { id: 'COMMON', name: 'Общее' },
            { id: 'TECHNICAL', name: 'Техническое' },
            { id: 'OTHER', name: 'Другое' },
          ]}
        />
      </ActionForm></DrawerAction>}
      {section==="room"&&<DrawerAction title="Новое прямоугольное помещение"><ActionForm title="Новое прямоугольное помещение"
        submit={async (d) => {
          const l = await api<Layout>('/floors/' + floor + '/layout'),
            x = n(d, 'x'),
            y = n(d, 'y'),
            w = n(d, 'w'),
            h = n(d, 'h');
          return api('/rooms', {
            floor_id: floor,
            name: val(d, 'name'),
            space_type_id: val(d, 'type'),
            area_m2: val(d, 'area') ? n(d, 'area') : null,
            polygon: [
              [x, y],
              [x + w, y],
              [x + w, y + h],
              [x, y + h],
            ],
            expectedVersion: l.floor.version,
          });
        }}
      >
        <label>
          Этаж
          <select value={floor} onChange={(e) => setFloor(e.target.value)} required>
            <option value="">Выберите</option>
            {floors.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {buildings.data?.find((b) => b.id === f.building_id)?.name} / {f.name}
              </option>
            ))}
          </select>
        </label>
        <Input label="Название / номер" name="name" />
        <Select label="Тип помещения" name="type" rows={types.data ?? []} />
        <Input label="Учётная площадь, м²" name="area" type="number" required={false} />
        <div className="form-row">
          <Input label="X" name="x" type="number" value={0} />
          <Input label="Y" name="y" type="number" value={0} />
          <Input label="Ширина" name="w" type="number" />
          <Input label="Высота" name="h" type="number" />
        </div>
        <small>Произвольный контур можно нарисовать в редакторе планировки.</small>
      </ActionForm></DrawerAction>}
    </div>
  );
}
export function Managers({ actor }: { actor: Actor }) {
  const list = useFacility<any[]>('/managers'),
    buildings = useFacility<any[]>('/buildings'),
    [q, setQ] = useState(''),[chosenEmployee,setChosenEmployee]=useState(''),[registrySearch,setRegistrySearch]=useState(''),[registryBuilding,setRegistryBuilding]=useState(''),
    people = useFacility<any[]>('/search?q=' + encodeURIComponent(q)),
    qc = useQueryClient(),
    remove = useMutation({
      mutationFn: (r: any) =>
        api('/managers', { building_id: r.building_id, employee_id: r.employee_id }, 'DELETE'),
      onSuccess: () => qc.invalidateQueries(),
    });
  return (
    <RegistryShell>
      <p>
        Ответственный с ролью АХО может изменять только закреплённые за ним здания. Администратор
        управляет назначениями ответственных.
      </p>
      {actor.role === 'admin' && (
        <DrawerAction title="+ Назначить ответственного"><ActionForm
          title="Назначить ответственного" disabled={!chosenEmployee}
          submit={(d) =>
            api(
              '/managers',
              {
                building_id: val(d, 'building'),
                employee_id: val(d, 'employee'),
                role: val(d, 'role'),
              },
              'PUT',
            )
          }
        >
          <Select label="Здание" name="building" rows={buildings.data ?? []} />
          <SearchSelect label="Сотрудник" value={chosenEmployee} onChange={setChosenEmployee} onSearch={setQ} minimum={2} loading={people.isFetching} options={(people.data??[]).map(p=>({id:p.id,label:p.display_name,detail:p.position}))}/><input type="hidden" name="employee" value={chosenEmployee}/>
          <Select
            label="Ответственность"
            name="role"
            rows={[
              { id: 'manager', name: 'Ответственный АХО' },
              { id: 'deputy', name: 'Заместитель' },
            ]}
          />
        </ActionForm></DrawerAction>
      )}
      <div className="registry-toolbar"><label>Поиск<input placeholder="Имя ответственного" value={registrySearch} onChange={e=>setRegistrySearch(e.target.value)}/></label><label>Здание<select value={registryBuilding} onChange={e=>setRegistryBuilding(e.target.value)}><option value="">Все здания</option>{buildings.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div><ErrorNotice error={list.error || remove.error} />
      <DataTable
        rows={(list.data??[]).filter(r=>(!registryBuilding||r.building_id===registryBuilding)&&r.display_name?.toLowerCase().includes(registrySearch.toLowerCase()))}
        columns={[
          ['building_name', 'Здание'],
          ['display_name', 'Ответственный'],
          ['role', 'Роль', (r) => (r.role === 'manager' ? 'Ответственный' : 'Заместитель')],
          [
            'action',
            '',
            (r) =>
              actor.role === 'admin' && (
                <DrawerAction title="Снять ответственность"><ActionForm title={r.display_name} label="Снять ответственность" submit={()=>remove.mutateAsync(r)}><p>{r.building_name} · Назначение ответственного будет снято.</p></ActionForm></DrawerAction>
              ),
          ],
        ]}
      />
    </RegistryShell>
  );
}
export function History() {
 const [search,setSearch]=useState(useUI.getState().historyQuery??''),[offset,setOffset]=useState(0);
 const audit=useFacility<any[]>('/audit?'+new URLSearchParams({q:search,offset:String(offset)}));
 return <RegistryShell><label>Действие, объект или автор<input value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="Найти изменение"/></label><ErrorNotice error={audit.error}/><div className="activity-feed">{audit.data?.map((r,i)=><article key={r.id??i}><time>{new Date(r.created_at).toLocaleString('ru')}</time><div><strong>{r.actor_name??(r.actor_id?.includes('admin')?'Администратор':r.actor_id?.includes('facilities')?'АХО':'Пользователь системы')}</strong><p>{({ 'room.classification':'Изменён тип помещения','floor.scale.confirm':'Подтверждён масштаб','floor.calibration':'Настроен масштаб','building.wizard':'Создано здание','workplace.reassign':r.details?.target?'Назначено рабочее место':'Снято назначение','building.create':'Добавлено здание','floor.create':'Добавлен этаж','template.create':'Добавлен тип мебели','department.name.restore':'Восстановлено название подразделения','quality.review':'Проверены данные','floor.recalculate':'Пересчитаны площади','floor.calibrate':'Подтверждён масштаб','assignment.create':'Назначено рабочее место','assignment.release':'Снято назначение','inventory.bulk-check':'Проверен инвентарь — массовая проверка','room.save':'Изменено помещение','room.parameters':'Уточнены параметры помещения','room.space':'Изменено назначение помещения','furniture.create':'Добавлена мебель','furniture.archive':'Мебель убрана в архив','manager.grant':'Назначен ответственный','manager.revoke':'Снята ответственность','parking.create':'Добавлено парковочное место','parking.zone':'Изменена зона парковки','building.update':'Изменены данные здания','floor.background':'Обновлён план этажа','space_type.create':'Добавлен тип помещения','lease.create':'Создан договор аренды','lease.cancel':'Договор отменён','lease.rate':'Изменена ставка аренды','tenant.create':'Добавлен арендатор','inventory.check':'Проверен инвентарь','layout.update':'Изменена планировка','booking.create':'Создана бронь','booking.cancel':'Отменена бронь'} as Record<string,string>)[r.action]??'Изменение данных'} · {r.entity_name?placeLabel(r.entity_name):'Объект учёта'}</p>{(r.before_place||r.after_place)&&<p>{r.before_place?placeLabel(r.before_place):'Без места'} → {r.after_place?placeLabel(r.after_place):'Без места'}</p>}<details><summary>Технические подробности</summary><pre className="audit-details">{JSON.stringify({action:r.action,object:r.entity_id,actor:r.actor_id,details:r.details},null,2)}</pre></details></div></article>)}</div>{audit.data?.length===0&&<p>Изменений по этому запросу нет.</p>}<div className="pagination"><button disabled={!offset} onClick={()=>setOffset(offset-100)}>Назад</button><button disabled={(audit.data?.length??0)<100} onClick={()=>setOffset(offset+100)}>Далее</button></div></RegistryShell>;
}
export function EditorTools({ layout, selected, point, onPick, droppedTemplate, dirty=false }: { droppedTemplate?:string; layout: Layout; selected?: Furniture; point?:{x:number;y:number}|null; onPick?:()=>void; dirty?:boolean }) {
  const templates = useFacility<any[]>('/templates'),
    [template, setTemplate] = useState(''),
    [error, setError] = useState<unknown>(null),
    qc = useQueryClient(),
    floor = layout.floor;
  const chosen = templates.data?.find((t) => t.id === template) ?? templates.data?.[0];
  const [positionX,setPositionX]=useState(''),[positionY,setPositionY]=useState('');
  useEffect(()=>{if(droppedTemplate)setTemplate(droppedTemplate);},[droppedTemplate]);
  useEffect(()=>{setPositionX('');setPositionY('');},[selected?.id]);
  useEffect(()=>{if(point){setPositionX(String(point.x));setPositionY(String(point.y));}},[point]);
  const physicalUncalibrated=!!chosen?.real_width_m&&!['confirmed_by_measurement','confirmed_by_reviewer'].includes(floor.scale_evidence?.status??'');
  const chosenWidth=chosen?.real_width_m&&floor.meters_per_unit?chosen.real_width_m/floor.meters_per_unit:chosen?.width;
  const chosenDepth=chosen?.real_depth_m&&floor.meters_per_unit?chosen.real_depth_m/floor.meters_per_unit:chosen?.depth;
  const unknown=layout.furniture.filter(f=>f.active&&(!f.width||!f.depth)).length;
  return (
    <div className="toolbar-actions desktop-editor editor-tools">

      <ErrorNotice error={error} />
      <div className="catalog-grid">
        <DrawerAction title="Подложка этажа"><ActionForm
          title="Подложка этажа"
          label="Загрузить SVG"
          submit={async (d) => {
            const file = d.get('file') as File;
            return api(
              '/floors/' + floor.id + '/background',
              { svg: await file.text(), expectedVersion: floor.version },
              'PUT',
            );
          }}
        >
          <label>
            SVG-файл
            <input name="file" type="file" accept=".svg,image/svg+xml" required />
          </label>
          <small>
            До 3 МБ. Геометрия, текст и локальные маски; без скриптов и внешних ссылок.
          </small>
        </ActionForm></DrawerAction>
        <DrawerAction title="Масштаб плана"><ActionForm
          key={floor.id}
          title="Масштаб плана"
          submit={(d) =>
            api(
              '/floors/' + floor.id + '/scale',
              { meters_per_unit: n(d, 'scale'), expectedVersion: floor.version },
              'PATCH',
            )
          }
        >
          <Input
            label="Метров в одной единице плана"
            name="scale"
            type="number"
            value={floor.meters_per_unit ?? ''}
          />
          <p>
            Статус:{' '}
            {floor.meters_per_unit ? 'масштаб задан вручную' : 'подтверждённый масштаб отсутствует'}
            .
          </p>
          {floor.scale_evidence?.candidate && (
            <p>
              Гипотеза по AREA / контурам: {floor.scale_evidence.candidate.toPrecision(5)} м/ед.
              Уверенность: {floor.scale_evidence.confidence === 'medium' ? 'средняя' : 'низкая'},
              образцов: {floor.scale_evidence.samples?.length}. Не применяется к площадям
              автоматически.
            </p>
          )}
          <small>
            Например: отрезок 100 единиц соответствует 5 м → масштаб 0,05. Учётная площадь остаётся
            отдельным полем.
          </small>
        </ActionForm></DrawerAction>
        <DrawerAction title="Добавить мебель" initialOpen={!!point}><ActionForm
          title={selected ? 'Добавить / дублировать мебель' : 'Добавить мебель'}
          label="Добавить на этаж"
          disabled={!chosen||!positionX||!positionY||unknown>0||dirty||physicalUncalibrated}
          successMessage="Предмет добавлен на выбранный этаж."
          submit={(d) =>
            api('/furniture', {
              floor_id: floor.id,
              template_id: val(d, 'template'),
              inventory_number: val(d, 'inventory') || null,
              x: n(d, 'x'),
              y: n(d, 'y'),
              width: n(d, 'width'),
              depth: n(d, 'depth'),
              rotation: n(d, 'rotation'),
              ...(val(d, 'code') ? { workplace_code: val(d, 'code') } : {}),
              expectedVersion: floor.version,
            })
          }
        >
          <label>
            Шаблон
            <select
              name="template"
              value={template || chosen?.id || ''}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {physicalUncalibrated&&<p role="alert">У этого типа мебели размеры указаны в метрах. Сначала настройте масштаб этажа по двум точкам.</p>}{chosen?.real_width_m&&<p>Размеры: {chosen.real_width_m} × {chosen.real_depth_m} м. {chosen.resize_allowed?'Изменение размеров разрешено.':'Размеры фиксированы.'}</p>}{unknown>0&&<p role="alert">Добавление пока недоступно: у {unknown} предметов на этаже не указаны ширина или глубина. Сначала нужно уточнить их размеры для проверки пересечений.</p>}
          {dirty&&<p role="alert">Сохраните или отмените перемещения мебели перед добавлением нового предмета.</p>}
          <button type="button" disabled={unknown>0||dirty} onClick={()=>{document.dispatchEvent(new Event('facility-close-drawer'));onPick?.();}}>Указать положение на карте</button>
          <small>Выберите центр предмета внутри помещения. Размеры и пересечения будут проверены при добавлении.</small>
          <div className="form-row" key={(selected?.id ?? 'new') + (chosen?.id ?? '')+floor.version}>
            <label>X центра<input name="x" type="number" required value={positionX} onChange={e=>setPositionX(e.target.value)}/></label>
            <label>Y центра<input name="y" type="number" required value={positionY} onChange={e=>setPositionY(e.target.value)}/></label>
            <Input
              label="Ширина"
              name="width"
              type="number"
              value={selected?.width ?? chosenWidth ?? 70}
            />
            <Input
              label="Глубина"
              name="depth"
              type="number"
              value={selected?.depth ?? chosenDepth ?? 40}
            />
          </div>
          <Input label="Поворот, °" name="rotation" type="number" step="30" value={0} />
          <Input label="Инвентарный № (новый)" name="inventory" required={false} />
          <Input label="Номер рабочего места (если нужно)" name="code" required={false} />
        </ActionForm></DrawerAction>
        {selected && (
          <DrawerAction title="Дополнительное рабочее место на этой мебели"><ActionForm
            title="Дополнительное рабочее место на этой мебели"
            submit={(d) => api('/workplaces', { furniture_id: selected.id, code: val(d, 'code') })}
          >
            <Input label="Номер рабочего места" name="code" />
            <small>
              Все места доступны в разделе «Рабочие места». На карте показывается первое.
            </small>
          </ActionForm></DrawerAction>
        )}
      </div>
      {selected && (
        <button
          onClick={async () => {
            if (!confirm('Убрать мебель с плана в архив? История сохранится.')) return;
            try {
              await api('/furniture/' + selected.id + '/archive', {
                expectedVersion: floor.version,
              });
              useUI.getState().set({ selected: null });
              qc.invalidateQueries();
            } catch (e) {
              setError(e);
            }
          }}
        >
          Убрать выбранную мебель в архив
        </button>
      )}
    </div>
  );
}
export function WorkplacesPage({ actor }: { actor: Actor }) {
  const qc = useQueryClient();
  const [filters,setFilters]=useState<Record<string,string>>({}),[inspected,setInspected]=useState<any>(null);
  const [checked,setChecked]=useState<string[]>([]);
  const [placeQuery,setPlaceQuery]=useState(''), [freeOnly,setFreeOnly]=useState(false);
  const [target,setTarget]=useState<any>(null), [q,setQ]=useState(''), [person,setPerson]=useState<any>(null);
  const [message,setMessage]=useState(''), [error,setError]=useState<unknown>(null);
  const list=useFacility<any[]>('/workplaces');
  const people=useQuery({queryKey:['facility','employee-choice',q],queryFn:()=>api<any[]>('/search?q='+encodeURIComponent(q)),enabled:q.trim().length>=2});
  const bulk=useMutation({mutationFn:(status:string)=>api('/workplaces/bulk-status',{ids:checked,status}),onSuccess:()=>{setChecked([]);qc.invalidateQueries();}});
  const statusChange=useMutation({mutationFn:(r:any)=>api('/workplaces/'+r.id+'/status',{status:r.status==='disabled'?'available':'disabled'},'PATCH'),onSuccess:()=>qc.invalidateQueries()});
  const assignment=useMutation({mutationFn:(input:{employeeId:string;workplaceId:string|null;expectedAssignmentId:string|null})=>api('/assignments',input),onSuccess:(_,input)=>{setTarget(null);setPerson(null);setQ('');setMessage(input.workplaceId?'Рабочее место закреплено за сотрудником.':'Постоянное назначение снято.');qc.invalidateQueries();}});
  useEffect(()=>{const focus=useUI.getState().registryFocus;if(focus?.screen==='workplaces'&&list.data){const row=list.data.find(r=>r.id===focus.id||r.furniture_id===focus.id);if(row){setInspected(row);setFilters({building_name:row.building_name,floor_name:row.floor_name,room_name:row.room_name});}useUI.getState().set({registryFocus:undefined});}},[list.data]);
  const location=(r:any)=>`${r.building_name} · этаж ${r.floor_name} · помещение ${r.room_name??'не указано'} · место ${r.code}`;
  const rows=(list.data??[]).filter(r=>Object.entries(filters).every(([key,value])=>!value||(key==='state'?(value==='occupied'?!!r.employee_id:value==='free'?!r.employee_id&&!r.reserved&&r.status==='available':r.status==='disabled'):String(r[key]??'')===value))&&(!freeOnly||(!r.employee_id&&!r.future_reserved&&r.status==='available'))&&[r.code,r.room_name,r.building_name,r.display_name].join(' ').toLowerCase().includes(placeQuery.toLowerCase()));
  return <RegistryShell>
    <p>Найдите место в реестре или на карте. В строке места можно назначить сотрудника или снять его постоянное назначение.</p>
    {target&&<section className="panel padded workplace-assignment control-assignment" aria-label="Назначение сотрудника">
      <h2>Назначить сотрудника на место {target.code}</h2><p>{location(target)}</p>
      <label>Сотрудник<input autoFocus placeholder="Начните вводить имя или фамилию" value={q} onChange={e=>{setQ(e.target.value);setPerson(null);assignment.reset();}}/></label>
      {!person&&q.trim().length<2&&<p className="muted">Введите хотя бы две буквы, затем выберите сотрудника из результатов.</p>}
      {!person&&q.trim().length>=2&&<div className="employee-choice" aria-label="Результаты поиска сотрудников">
        {people.isFetching?<p>Поиск…</p>:(people.data??[]).map(p=><button key={p.id} onClick={()=>{setPerson(p);setQ(p.display_name);}}><strong>{p.display_name}</strong><span>{p.position||'Должность не указана'}{p.workplace_id?' · Есть постоянное место':''}</span></button>)}
        {!people.isFetching&&people.data?.length===0&&<p>Сотрудники не найдены.</p>}
      </div>}
      {person&&<div className="assignment-preview"><strong>{person.display_name}</strong><dl><dt>Сейчас</dt><dd>{person.workplace_id?`${person.building_name??''} · ${person.room_name??''} · ${placeLabel(person.code)}`:'Постоянного места нет'}</dd><dt>После подтверждения</dt><dd>{location(target)}</dd></dl>{person.workplace_id&&<p>Предыдущее назначение будет закрыто; история сохранится.</p>}</div>}
      <div className="workplace-actions"><button className="primary" disabled={!person||assignment.isPending} onClick={()=>{
        
        assignment.mutate({employeeId:person.id,workplaceId:target.id,expectedAssignmentId:person.assignment_id??null});
      }}>{person?.workplace_id?'Перенести на это место':'Подтвердить назначение'}</button><button onClick={()=>{setTarget(null);assignment.reset();}}>Отмена</button></div>
    </section>}
    <ErrorNotice error={list.error||people.error||assignment.error||statusChange.error||bulk.error||error}/>
    {message&&<p role="status">{message}</p>}
    <div className="panel padded workplace-toolbar">
      <label>Поиск в реестре<input placeholder="Здание, помещение, номер места или сотрудник" value={placeQuery} onChange={e=>{setPlaceQuery(e.target.value);setChecked([]);}}/></label>
      <div className="workplace-actions"><label className="inline-check"><input type="checkbox" checked={freeOnly} onChange={e=>{setFreeOnly(e.target.checked);setChecked([]);}}/>Только места без назначений и броней</label>
      {actor.role!=='employee'&&<button onClick={()=>download('workplaces').catch(setError)}>Скачать CSV</button>}</div>
    </div>
    <div className="registry-toolbar">{[['building_name','Здание'],['floor_name','Этаж'],['room_name','Помещение'],['department_name','Подразделение']].map(([key,label])=><label key={key}>{label}<select value={filters[key]??''} onChange={e=>{setFilters({...filters,[key]:e.target.value,...(key==='building_name'?{floor_name:'',room_name:''}:key==='floor_name'?{room_name:''}:{})});setChecked([]);}}><option value="">Все</option>{[...new Set((list.data??[]).filter(r=>key==='building_name'||!filters.building_name||r.building_name===filters.building_name).filter(r=>key!=='room_name'||!filters.floor_name||r.floor_name===filters.floor_name).map(r=>r[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru',{numeric:true})).map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}<label>Статус<select value={filters.state??''} onChange={e=>{setFilters({...filters,state:e.target.value});setChecked([]);}}><option value="">Все</option><option value="free">Свободно сейчас</option><option value="occupied">Назначено</option><option value="disabled">Не используется</option></select></label></div>
    <p className="registry-counts">{rows.length} мест · {rows.filter(r=>r.employee_id).length} назначено · {rows.filter(r=>!r.employee_id&&!r.reserved&&r.status==='available').length} свободно сейчас</p>
    {inspected&&<div className="control-shade"><section className="control-drawer" role="dialog" aria-label="Карточка рабочего места"><button onClick={()=>setInspected(null)}>Закрыть</button><h2>{placeLabel(inspected.code)}</h2><p>{location(inspected)}</p><h3>{inspected.display_name??'Свободное место'}</h3><p>{inspected.department_name}</p><div className="toolbar-actions"><button onClick={()=>openFacilityResult({...inspected,kind:'workplace'})}>На карте</button><button onClick={()=>useUI.getState().set({screen:'history',historyQuery:inspected.furniture_id??inspected.id})}>История</button>{!inspected.employee_id&&inspected.status==='available'&&!inspected.future_reserved&&<button onClick={()=>{setTarget(inspected);setInspected(null);setPerson(null);setQ('');}}>Назначить сотрудника</button>}</div></section></div>}
    {actor.role!=='employee'&&checked.length>0&&<div className="panel padded workplace-actions sticky-bulk" aria-label="Действия с выбранными местами"><strong>Выбрано: {checked.length}</strong><button disabled={bulk.isPending} onClick={()=>bulk.mutate('available')}>Вернуть в использование</button><button disabled={bulk.isPending} onClick={()=>{if(confirm('Вывести выбранные места из использования? Если среди них есть занятое или забронированное место, вся операция будет отменена.'))bulk.mutate('disabled');}}>Вывести из использования</button><button onClick={()=>setChecked([])}>Снять выбор</button></div>}
    <DataTable rows={rows} onRowClick={r=>setInspected(r)} columns={[
      ['select','Выбор',r=>actor.role!=='employee'&&<input type="checkbox" aria-label={'Выбрать '+r.code} checked={checked.includes(r.id)} onChange={e=>setChecked(e.target.checked?[...checked,r.id]:checked.filter(id=>id!==r.id))}/>],
      ['map','Карта',r=><button onClick={()=>openFacilityResult({...r,kind:'workplace'})}>На карте</button>],
      ['building_name','Здание'],['floor_name','Этаж'],['room_name','Помещение'],['code','Место',r=>placeLabel(r.code)],['display_name','Сотрудник'],['department_name','Подразделение'],
      ['status','Состояние',r=>r.status==='disabled'?'Выведено из использования':r.employee_id?'Закреплено за сотрудником':r.reserved?'Занято по брони сейчас':r.future_reserved?'Есть предстоящая бронь':'Свободно'],
      ['actions','Действия',r=>actor.role!=='employee'&&<details className="row-menu"><summary aria-label="Действия с рабочим местом">⋯</summary><div className="workplace-row-actions"><button onClick={()=>openFacilityResult({...r,kind:'workplace'})}>На карте</button><button onClick={()=>useUI.getState().set({screen:'history',historyQuery:r.furniture_id??r.id})}>История</button>
        {r.employee_id?<button disabled={assignment.isPending} onClick={()=>{if(confirm(`Снять постоянное назначение: ${r.display_name}, ${location(r)}?`))assignment.mutate({employeeId:r.employee_id,workplaceId:null,expectedAssignmentId:r.assignment_id});}}>Снять назначение</button>:r.status==='available'&&!r.future_reserved&&<button onClick={()=>{setTarget(r);setPerson(null);setQ('');setMessage('');assignment.reset();}}>Назначить сотрудника</button>}
        {!r.employee_id&&!r.future_reserved&&<button disabled={statusChange.isPending} onClick={()=>{if(r.status==='disabled'||confirm(`Вывести место ${r.code} из использования? Его нельзя будет назначить или забронировать до повторного включения.`))statusChange.mutate(r);}}>{r.status==='disabled'?'Вернуть в использование':'Вывести из использования'}</button>}
      </div></details>],
    ]}/>
  </RegistryShell>;
}
export function ParkingAdmin() {
  const buildings = useFacility<any[]>('/buildings'),
    spots = useFacility<any[]>('/parking'),
    [q, setQ] = useState(''),
    [employee,setEmployee] = useState(''),
    [spot,setSpot] = useState(''),
    found = useFacility<any[]>('/search?q=' + encodeURIComponent(q),q.trim().length>=2);
  const qc=useQueryClient();
  const current=spots.data?.find(p=>p.employee_id===employee);
  const release=useMutation({mutationFn:(p:any)=>api('/parking/assignments',{employeeId:p.employee_id,parkingSpotId:null,expectedAssignmentId:p.assignment_id}),onSuccess:()=>{setSpot('');qc.invalidateQueries();}});
  return (
    <div className="catalog-grid">
      <ActionForm
        title="Назначение парковки сотруднику"
        disabled={!employee || !spot || release.isPending || spots.isFetching}
        label="Назначить / перенести"
        submit={async (d) => {
          if(!employee || !spot) throw new Error('Выберите сотрудника и парковочное место.');
          if(current && current.id!==spot && !confirm(`Перенести ${current.display_name} с парковочного места ${current.number} на ${spots.data?.find(p=>p.id===spot)?.number}?`)) return;
          return api('/parking/assignments', {
            employeeId: employee,
            parkingSpotId: spot,
            expectedAssignmentId:current?.assignment_id??null,
            vehicle: val(d, 'vehicle'),
          });
        }}
      >
        <SearchSelect label="Сотрудник" value={employee} onChange={id=>{setEmployee(id);setSpot('');release.reset();}} onSearch={setQ} minimum={2} loading={found.isFetching} placeholder="Имя или подразделение" options={(found.data??[]).map(e=>({id:e.id,label:e.display_name,detail:e.position||undefined}))}/>
        <ErrorNotice error={found.error}/>
        {employee&&<p>{current?`Текущее место: ${current.number}`:'Постоянное парковочное место не назначено.'}</p>}
        {current&&<button type="button" disabled={release.isPending} onClick={()=>{if(confirm(`Снять назначение парковочного места ${current.number} у сотрудника ${current.display_name}?`))release.mutate(current);}}>Снять назначение</button>}
        <ErrorNotice error={release.error||spots.error}/>
        {release.isSuccess&&<p role="status">Назначение парковочного места снято.</p>}
        <label>Парковочное место<select required value={spot} onChange={e=>setSpot(e.target.value)}><option value="">Выберите место</option>{(spots.data??[]).filter(p=>p.status==='available'&&p.building_active&&!p.future_reserved&&(!p.employee_id||p.employee_id===employee)).map(p=><option key={p.id} value={p.id}>{buildings.data?.find(b=>b.id===p.building_id)?.name} · {p.number}</option>)}</select></label>
        <Input label="Автомобиль / номер" name="vehicle" required={false} />
      </ActionForm>
      <ActionForm
        title="Зона парковки"
        submit={(d) =>
          api('/parking/' + val(d, 'spot') + '/details', { zone: val(d, 'zone') }, 'PATCH')
        }
      >
        <Select label="Место" name="spot" rows={spots.data ?? []} />
        <Input label="Зона" name="zone" />
      </ActionForm>
      <ActionForm
        title="Тариф парковки за месяц"
        submit={(d) =>
          api('/parking-rates', {
            building_id: val(d, 'building'),
            rate_per_spot: n(d, 'rate'),
            currency: val(d, 'currency'),
            valid_from: val(d, 'from'),
            valid_to: val(d, 'to') || null,
          })
        }
      >
        <Select label="Здание" name="building" rows={buildings.data ?? []} />
        <Input label="За место / месяц" name="rate" type="number" />
        <Input label="Валюта" name="currency" value="RUB" />
        <Input label="С даты" name="from" type="date" />
        <Input label="До даты, исключая" name="to" type="date" required={false} />
      </ActionForm>
    </div>
  );
}
export function RoomDrawForm({
  floor,
  points,
  roomId,
  expectedVersion,
  onDone,
}: {
  floor: Layout['floor'];
  points: [number, number][];
  roomId: string | null;
  expectedVersion: number;
  onDone: () => void;
}) {
  const types = useFacility<any[]>('/space-types');
  return (
    <ActionForm
      title={roomId ? 'Новый контур выбранного помещения' : 'Помещение по контуру'}
      label="Сохранить контур"
      submit={async (d) => {
        await api(
          roomId ? '/rooms/' + roomId : '/rooms',
          {
            floor_id: floor.id,
            name: val(d, 'name'),
            space_type_id: val(d, 'type'),
            area_m2: val(d, 'area') ? n(d, 'area') : null,
            polygon: points,
            expectedVersion,
          },
          roomId ? 'PUT' : 'POST',
        );
        onDone();
      }}
    >
      <Input label="Название помещения" name="name" />
      <Select label="Тип" name="type" rows={types.data ?? []} />
      <Input
        label="Учётная площадь, м² (если известна)"
        name="area"
        type="number"
        required={false}
      />
      <small>
        Вершин: {points.length}. Нажимайте на карту, чтобы добавить вершины. Минимум три.
      </small>
    </ActionForm>
  );
}

export function LayoutVersions({layout,dirty=false}:{layout:Layout;dirty?:boolean}) {
  const versions=useFacility<any[]>('/floors/'+layout.floor.id+'/versions');
  const [selected,setSelected]=useState('');
  const detail=useFacility<any>('/floors/'+layout.floor.id+'/versions/'+selected,!!selected);
  const qc=useQueryClient();
  const restore=useMutation({mutationFn:()=>api('/floors/'+layout.floor.id+'/versions/'+selected+'/restore',{expectedVersion:layout.floor.version}),onSuccess:()=>qc.invalidateQueries()});
  return <details className="panel padded"><summary>Версии планировки</summary>
    <ErrorNotice error={versions.error||detail.error||restore.error}/>
    <label>Сравнить с текущей версией {layout.floor.version}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Выберите версию</option>{versions.data?.map(v=><option key={v.version} value={v.version}>{v.version} · {v.comment?.includes('baseline')?'Исходная версия':v.comment||'Изменение плана'} · {new Date(v.created_at).toLocaleString('ru')}</option>)}</select></label>
    {detail.data&&<><p>Изменено предметов: {detail.data.diff.length}; помещений: {detail.data.roomDiff?.length??0}; полей этажа: {detail.data.floorChanged?.join(", ")||"нет"}</p><DataTable rows={detail.data.diff} columns={[
      ['id','Предмет',r=>placeLabel(layout.furniture.find(f=>f.id===r.id)?.code)||'Предмет мебели'],['kind','Изменение',r=>({added:'Добавлено',removed:'Удалено',room_changed:'Изменено помещение',moved:'Перемещено / изменено'} as Record<string,string>)[r.kind]||r.kind],['before','Выбранная версия',r=><details><summary>Параметры</summary><pre>{JSON.stringify(r.before,null,2)}</pre></details>],['after','Сейчас',r=><details><summary>Параметры</summary><pre>{JSON.stringify(r.after,null,2)}</pre></details>]]
    }/><DataTable rows={detail.data.roomDiff||[]} columns={[['id','Помещение',r=>layout.rooms.find(x=>x.id===r.id)?.name??'Архивное помещение'],['before','Выбранная версия',r=><details><summary>Параметры</summary><pre>{JSON.stringify(r.before,null,2)}</pre></details>],['after','Сейчас',r=><details><summary>Параметры</summary><pre>{JSON.stringify(r.after,null,2)}</pre></details>]]}/><p>Восстанавливаются подложка, комнаты и состав мебели в новой версии. Назначения и инвентаризационные отметки сохраняются. Удаление занятых или забронированных мест блокируется.</p><ActionForm title={`Восстановить версию ${selected} как новую`} disabled={dirty||restore.isPending} label="Восстановить как новую версию" submit={async()=>{await restore.mutateAsync();}}><p>Текущая версия {layout.floor.version} сохранится в истории. Выбранная планировка станет новой версией.</p></ActionForm>{dirty&&<p>Сначала сохраните или отмените изменения редактора.</p>}</>}
  </details>;
}

export function RateHistory() {
 const rates=useFacility<any[]>('/cost-rates'),buildings=useFacility<any[]>('/buildings'),rooms=useFacility<any>('/dashboard'),types=useFacility<any[]>('/space-types');
 const scope=(r:any)=>r.room_id?rooms.data?.rooms?.find((x:any)=>x.id===r.room_id)?.name??'Помещение':r.building_id?buildings.data?.find(b=>b.id===r.building_id)?.name??'Здание':'Все здания';
 return <section><h3>Тарифы</h3><ErrorNotice error={rates.error}/><DataTable rows={rates.data??[]} columns={[["scope","Область",scope],["space_type_id","Тип",r=>types.data?.find(t=>t.id===r.space_type_id)?.name??'Тип помещения'],["rate_per_m2","За м²"],["currency","Валюта"],["period","Период",r=>r.period==='month'?'Месяц':'Год'],["valid_from","С",r=>String(r.valid_from).slice(0,10)],["valid_to","До",r=>r.valid_to?String(r.valid_to).slice(0,10):'Без окончания'],["action","",r=><DrawerAction title="Изменить период"><ActionForm title={scope(r)+' · '+r.rate_per_m2+' '+r.currency} label="Закрыть период" submit={d=>api('/cost-rates/'+r.id+'/close',{valid_to:val(d,'until'),expectedValidTo:r.valid_to?String(r.valid_to).slice(0,10):null})}><p>История тарифов сохранится. Новую ставку добавьте с даты окончания этого периода.</p><label>Не действует начиная с<input name="until" type="date" required max={r.valid_to?String(r.valid_to).slice(0,10):undefined}/></label></ActionForm></DrawerAction>]]}/></section>;
}

function openFacilityResult(r:any){
 if(r.kind==='lease'||r.kind==='tenant'){useUI.getState().set({screen:'leases',leaseId:r.kind==='lease'?r.id:undefined});return;}
 useUI.getState().set({bookingDesk:false,screen:r.floor_id?'floor':r.kind==='parking'?'parking':'building',buildingId:r.building_id||'',floorId:r.floor_id||'',selected:r.furniture_id||(['room','furniture'].includes(r.kind)?r.id:null)});
}
export function GlobalSearch({onClose}:{onClose:()=>void}){
 const [q,setQ]=useState(''),[term,setTerm]=useState('');
 useEffect(()=>{const t=setTimeout(()=>setTerm(q),180);return()=>clearTimeout(t);},[q]);
 useEffect(()=>{const f=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[onClose]);
 const results=useFacility<any[]>('/unified-search?q='+encodeURIComponent(term),term.trim().length>=2);
 const kinds:Record<string,string>={employee:'Сотрудник',room:'Помещение',workplace:'Рабочее место',inventory:'Инвентарь',building:'Здание',parking:'Парковка',tenant:'Арендатор',lease:'Договор'};
 return <div className="search-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="search-dialog panel" role="dialog" aria-modal="true" aria-label="Поиск"><div className="search-dialog-heading"><input autoFocus aria-label="Найти человека, помещение или рабочее место" placeholder="Найти человека, помещение или рабочее место…" value={q} onChange={e=>setQ(e.target.value)}/><button onClick={onClose} aria-label="Закрыть поиск">×</button></div><ErrorNotice error={results.error}/><div className="search-results">{term.trim().length<2?<p>Введите хотя бы две буквы или номер.</p>:results.isFetching?<p>Ищем…</p>:!results.data?.length?<p>Ничего не найдено. Попробуйте другое имя или номер.</p>:results.data.map((r,index)=><React.Fragment key={r.kind+r.id}>{(index===0||results.data![index-1].kind!==r.kind)&&<h3 className="search-group-title">{({employee:'Люди',room:'Помещения',workplace:'Рабочие места'} as any)[r.kind]||kinds[r.kind]}</h3>}<button key={r.kind+r.id} className="search-result" disabled={r.kind==='employee'&&!r.floor_id} onClick={()=>{openFacilityResult(r);onClose();}}><span><small>{kinds[r.kind]||r.kind}</small><strong>{/^Employee \d+$/.test(r.label)?'Имя не указано':r.kind==='workplace'?placeLabel(r.label):r.label}</strong><small>{[r.position,r.department_name].filter(Boolean).join(' · ')}</small><span>{[r.building_name,r.floor_name&&'этаж '+r.floor_name,r.room_name,r.workplace_code&&placeLabel(r.workplace_code)].filter(Boolean).join(' · ')}</span></span><small>{r.floor_id?'Показать на карте →':r.kind==='employee'?'Место не назначено':'Открыть →'}</small></button></React.Fragment>)}</div></section></div>;
}
export function UnifiedFacilitySearch(){
 const [q,setQ]=useState('');const results=useFacility<any[]>('/unified-search?q='+encodeURIComponent(q),q.trim().length>=2);
 return <section className="panel padded"><h3>Поиск по объектам и сотрудникам</h3><input aria-label="Единый поиск" placeholder="Сотрудник, помещение, инвентарный номер, место, здание" value={q} onChange={e=>setQ(e.target.value)}/><ErrorNotice error={results.error}/>{q.trim().length>=2&&<DataTable rows={results.data||[]} columns={[["kind","Тип"],["label","Результат"],["id","Открыть",r=><button onClick={()=>openFacilityResult(r)}>Открыть</button>]]}/>}</section>;
}
const legacyReason = (reason: string) => ({
  'Missing floor': 'Помещение не связано с этажом. Нужно определить этаж по исходным документам.',
  'Missing floor or template': 'Для предмета не найден этаж или тип мебели. Нужно сверить исходную запись.',
  'Ambiguous, missing or inactive workplace assignment': 'Назначение сотрудника не перенесено: место неоднозначно, отсутствует или неактивно. АХО должно подтвердить действующее место.'
} as Record<string,string>)[reason] || 'Требуется сверка исходной записи: ' + reason;
const reviewLabels:Record<string,string>={OPEN:'Нужно проверить',IN_REVIEW:'Проверяем',RESOLVED:'Проверка завершена',IGNORED:'Решено оставить без изменения'};
const queueHelp:Record<string,string>={
 rooms_without_area:'Откройте комнату на карте. Внесите подтверждённую площадь и источник в разделе «История обмеров». Количество рабочих мест не позволяет определить площадь.',
 unverified_scale:'Сверьте план с документом или контрольным обмером. Подтвердите масштаб этажа, прежде чем использовать площади по контурам.',
 missing_svg:'Найдите план этажа и загрузите его в карточке этажа.',
 invalid_geometry:'Контур нельзя использовать для расчёта площади. Сверьте его с планом и исправьте в редакторе планировки.',
 missing_inventory:'Откройте предмет в разделе «Инвентарь» и внесите номер из реестра имущества.',
 duplicate_inventory:'Сверьте предметы с реестром имущества и исправьте повторяющиеся инвентарные номера.',
 furniture_outside_room:'Проверьте положение предмета и контур комнаты на карте; исправьте планировку при необходимости.',
 quarantine:'Сверьте запись с ответственным АХО и примените подтверждённое решение в форме выше. Исходная запись и основание решения сохранятся в истории.'
};
const queueLabels:Record<string,string>={area_discrepancy:"Площади расходятся более чем на 10%",missing_svg:"Нет подложки",unverified_scale:"Масштаб не подтверждён",rooms_without_area:"Нет учётной площади",invalid_geometry:"Ошибка геометрии",missing_inventory:"Нет инвентарного номера",duplicate_inventory:"Дубликат номера",furniture_outside_room:"Мебель за пределами помещения",quarantine:"Конфликты импорта"};
export function QualityQueue(){
 const [taskSearch,setTaskSearch]=useState('');const [review,setReview]=useState<any>(null);const qc=useQueryClient();
 const actor=useUI();const decisions=useFacility<any[]>('/quarantine-decisions',actor.demoRole==='admin');
 const [priority,setPriority]=useState(''),[reviewStatus,setReviewStatus]=useState('');
 const [category,setCategory]=useState(actor.qualityCategory??''),[building,setBuilding]=useState(''),[offset,setOffset]=useState(0),[error,setError]=useState<unknown>(null);
 const buildings=useFacility<any[]>('/buildings');const params=new URLSearchParams({q:taskSearch,category,building,priority,status:reviewStatus,offset:String(offset)});const result=useFacility('/quality-queue?'+params);
 const exportCsv=async()=>{try{const s=useUI.getState();const token=demo?`${import.meta.env.VITE_DEMO_TOKEN}:${s.demoRole}`:s.token;const r=await fetch('/api/quality-queue?'+params+'&format=csv',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Ошибка экспорта');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='data-quality.csv';a.click();URL.revokeObjectURL(url);}catch(e){setError(e);}};
 return <RegistryShell><h3>Проверка и уточнение данных</h3>{actor.demoRole==='admin'&&<details><summary>Применённые решения по переносу ({decisions.data?.length??0})</summary><ErrorNotice error={decisions.error}/><DataTable rows={decisions.data??[]} columns={[["object_name","Объект"],["action","Решение",r=>({assign:"Место назначено",unassigned:"Без постоянного места",recover_room:"Помещение восстановлено",exclude:"Не подлежит переносу"} as Record<string,string>)[r.action]],["evidence","Основание"],["resolved_by","Подтвердил"],["resolved_at","Дата"]]}/></details>}<p>Откройте объект на карте или начните проверку. Замечание остаётся в очереди, пока не исправлены исходные данные.</p>{review&&<div className="control-shade"><section className="control-drawer" role="dialog" aria-modal="true" aria-label="Проверка данных"><button className="drawer-close" onClick={()=>setReview(null)}>Закрыть</button>{review?.category==='quarantine'&&<QuarantineDecision key={review.id} issue={review} onDone={()=>{setReview(null);qc.invalidateQueries();}}/>}{review?.category==='rooms_without_area'&&<RoomParameters initialRoomId={review.id}/>} {review&&<ActionForm key={review.category+review.id+review.revision} title={'Результат проверки: '+(review.category==='quarantine'?legacyReason(review.label):review.label)} submit={d=>api('/quality-review',{category:review.category,id:review.id,status:val(d,'status'),comment:val(d,'comment'),resolutionNote:val(d,'resolution'),assignToMe:true,expectedRevision:review.revision}).then(()=>{setReview(null);qc.invalidateQueries();})}><p>{queueHelp[review.category]}</p><label>Статус проверки<select name="status" defaultValue={review.status}>{['OPEN','IN_REVIEW','RESOLVED','IGNORED'].filter(x=>review.category!=='quarantine'||x!=='RESOLVED').map(x=><option key={x} value={x}>{reviewLabels[x]}</option>)}</select></label><Input label="Комментарий" name="comment" value={review.comment||''} required={false}/><Input label="Что проверили и на основании какого документа" name="resolution" value={review.resolution_note||''} required={false}/><p>После сохранения вы становитесь исполнителем проверки. Исходная проблема остаётся в списке, пока не исправлены сами данные.</p><button type="button" onClick={()=>setReview(null)}>Отмена</button></ActionForm>}</section></div>}<ErrorNotice error={error||result.error}/><div className="priority-tabs">{[["","Все"],["critical","Критические"],["review","Требуют проверки"],["info","Информация"]].map(([id,label])=><button key={id} className={priority===id?"active":""} onClick={()=>{setPriority(id);setOffset(0);}}>{label}</button>)}</div><div className="registry-toolbar"><label>Поиск задачи<input placeholder="Помещение, объект или здание" value={taskSearch} onChange={e=>{setTaskSearch(e.target.value);setOffset(0);}}/></label><select aria-label="Статус проверки" value={reviewStatus} onChange={e=>{setReviewStatus(e.target.value);setOffset(0);}}><option value="">Все статусы</option>{Object.entries(reviewLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select aria-label="Категория качества" value={category} onChange={e=>{setCategory(e.target.value);setOffset(0);}}><option value="">Все категории</option>{Object.entries(result.data?.counts||{}).map(([c,n])=><option key={c} value={c}>{queueLabels[c]||c} ({String(n)})</option>)}</select><select aria-label="Здание качества" value={building} onChange={e=>{setBuilding(e.target.value);setOffset(0);}}><option value="">Все здания</option>{buildings.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button onClick={exportCsv}>Экспорт CSV</button></div><p>Обнаружено записей с замечаниями: {result.data?.total??'…'}</p><DataTable rows={result.data?.rows||[]} columns={[["priority","Важность",r=><StatusChip tone={r.priority}>{({critical:"Критическое",review:"Проверить",info:"Информация"} as any)[r.priority]}</StatusChip>], ["building_name","Здание"],["floor_name","Этаж"],["category","Что нужно сделать",r=><div className="task-description"><strong>{queueLabels[r.category]||"Проверить данные"}</strong><small>{queueHelp[r.category]||"Сверьте исходные данные и зафиксируйте основание решения."}</small></div>],["label","Объект",r=>r.category==='quarantine'?legacyReason(r.label):r.label],["status","Статус проверки",r=>reviewLabels[r.status]||r.status],["review","Результат проверки",r=><button onClick={()=>setReview(r)}>Проверить</button>],["id","Проверить",r=>r.floor_id?<button onClick={()=>openFacilityResult(r)}>На карте</button>:<span>Сверка источника</span>]]}/><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-200))}>Назад</button><button disabled={offset+200>=(result.data?.total??0)} onClick={()=>setOffset(offset+200)}>Далее</button></RegistryShell>;
}

export function RoomCsvImport(){
 const [text,setText]=useState('id,space_type_id\n'),[preview,setPreview]=useState<any>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);const qc=useQueryClient();
 return <details className="panel padded"><summary>Массовая классификация помещений — CSV</summary><button onClick={()=>download("room-classification").catch(setError)}>Выгрузить текущие типы CSV</button><button onClick={()=>download("space").catch(setError)}>Отчёт по площадям CSV</button><p>Колонки: id,space_type_id. До 500 помещений. Сначала проверьте изменения, затем примените их.</p><textarea aria-label="CSV помещений" rows={5} value={text} onChange={e=>{setText(e.target.value);setPreview(null);}}/><ErrorNotice error={error}/><button disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{setPreview(await api('/rooms/import-preview',{csv:text}));}catch(e){setError(e);}finally{setBusy(false);}}}>Проверить CSV</button>{preview&&<><DataTable rows={preview.errors} columns={[["row","Строка"],["error","Ошибка"]]}/><DataTable rows={preview.changes} columns={[["id","Помещение"],["before","До"],["after","После"]]}/><button disabled={busy||!preview.previewId} onClick={async()=>{setBusy(true);try{await api('/rooms/import-apply',{previewId:preview.previewId});setPreview(null);qc.invalidateQueries();}catch(e){setError(e);}finally{setBusy(false);}}}>Применить проверенные изменения</button></>}</details>;
}

export function RoomAreaHistory({room}:{room:any}){
 const h=useFacility<any[]>('/rooms/'+room.id+'/area-history');
 return <details><summary>История обмеров</summary><ErrorNotice error={h.error}/><DataTable rows={h.data||[]} columns={[["area_m2","м²"],["valid_from","С"],["valid_to","До"],["source","Источник"]]}/><ActionForm title="Новый подтверждённый обмер" submit={d=>api('/rooms/'+room.id+'/area-history',{area_m2:Number(val(d,'area')),valid_from:val(d,'from'),source:val(d,'source'),expectedArea:room.area_m2===null?null:Number(room.area_m2)})}><Input name="area" label="Площадь, м²" type="number"/><Input name="from" label="Действует с" type="date"/><Input name="source" label="Документ или источник обмера"/></ActionForm></details>;
}

export function RoomParameters({initialRoomId=''}:{initialRoomId?:string}) {
 const data=useFacility('/dashboard'),types=useFacility<any[]>('/space-types');
 const [building,setBuilding]=useState(''),[floor,setFloor]=useState(''),[roomId,setRoomId]=useState(initialRoomId),[search,setSearch]=useState('');
 useEffect(()=>{if(initialRoomId)setRoomId(initialRoomId);},[initialRoomId]);
 const rooms=data.data?.rooms??[],room=rooms.find((r:any)=>r.id===roomId);
 const buildings=[...new Map<string,string>(rooms.map((r:any)=>[r.building_id,r.building_name])).entries()];
 const floors=[...new Map<string,string>(rooms.filter((r:any)=>r.building_id===building).map((r:any)=>[r.floor_id,r.floor_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'ru',{numeric:true}));
 const visible=rooms.filter((r:any)=>r.building_id===building&&(!floor||r.floor_id===floor)&&(!search||r.name.toLowerCase().includes(search.toLowerCase())));
 return <section className={initialRoomId?"room-parameters-inline":"panel padded"}>{!initialRoomId&&<h2>Параметры помещения</h2>}<ErrorNotice error={data.error||types.error}/>{!initialRoomId&&<><label>Здание помещения<select value={building} onChange={e=>{setBuilding(e.target.value);setFloor('');setRoomId('');}}><option value="">Выберите здание</option>{buildings.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Этаж помещения<select disabled={!building} value={floor} onChange={e=>{setFloor(e.target.value);setRoomId('');}}><option value="">Все этажи здания</option>{floors.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Номер или название комнаты<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Помещение<select disabled={!building} value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Выберите помещение ({visible.length})</option>{visible.map((r:any)=><option key={r.id} value={r.id}>{r.building_name} · этаж {r.floor_name} · {r.name} · {r.official_area_m2==null?'площадь не указана':r.official_area_m2+' м²'}</option>)}</select></label></>}
 {room&&<ActionForm key={[room.id,room.official_area_m2,room.space_type_id].join('|')} title={initialRoomId?"Изменить параметры":`${room.building_name} · этаж ${room.floor_name} · ${room.name}`} label="Применить изменения помещения" submit={d=>api('/rooms/'+room.id+'/parameters',{area_m2:val(d,'area').trim()===''?null:Number(val(d,'area')),space_type_id:val(d,'type'),name:val(d,'name'),expectedName:room.name,expectedArea:room.official_area_m2==null?null:Number(room.official_area_m2),expectedType:room.space_type_id,source:val(d,'source')},'PATCH')}><label>Номер и понятное название<input name="name" required maxLength={200} defaultValue={room.name} placeholder="Например: 824 — бухгалтерия"/></label>{!initialRoomId&&<button type="button" onClick={()=>openFacilityResult({...room,kind:'room'})}>Показать и редактировать на карте</button>}<label>Назначение помещения<select required name="type" defaultValue={room.space_type_id||''}><option value="">Выберите тип</option>{types.data?.map(t=><option key={t.id} value={t.id}>{t.name} · {classLabels[t.category]||t.category}</option>)}</select></label><label>Площадь по документам, м²<input name="area" type="number" min="0" max="10000000" step="0.01" defaultValue={room.official_area_m2??''}/></label><small>Нет данных о площади — оставьте поле пустым.</small><details><summary>Как рассчитывается площадь</summary><p>По контуру: {room.calculated_area_m2??'не рассчитано — нужен пригодный контур и подтверждённый масштаб'}. Площадь по документам имеет приоритет при расчётах.</p></details><label>Основание изменения<input name="source" required minLength={3} maxLength={1000} placeholder="Обмер, документ или подтверждение назначения комнаты"/></label><small>Сохранение обновит параметры комнаты и расчёты. Изменения останутся в истории.</small></ActionForm>}
 </section>;
}
function QuarantineDecision({issue,onDone}:{issue:any;onDone:()=>void}){
 const detail=useFacility('/quarantine/'+issue.id+'/decision'),places=useFacility<any[]>('/workplaces'),floors=useFacility<any[]>('/floors'),buildings=useFacility<any[]>('/buildings'),types=useFacility<any[]>('/space-types');
 const [action,setAction]=useState(''),[search,setSearch]=useState('');
 const d=detail.data;
 if(!d)return <><ErrorNotice error={detail.error}/><p>Загружаем исходную запись…</p></>;
 const available=(places.data??[]).filter(w=>w.status==='available'&&!w.future_reserved&&(!w.employee_id||w.employee_id===d.employee?.id)&&[w.code,w.building_name,w.floor_name,w.room_name].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <ActionForm title="Исправить спорную запись" label="Применить подтверждённое решение" submit={form=>api('/quarantine/'+issue.id+'/resolve',{action,evidence:val(form,'evidence'),workplaceId:action==='assign'?val(form,'workplace'):null,expectedAssignmentId:d.current?.id??null,...(action==='recover_room'?{floorId:val(form,'floor'),spaceTypeId:val(form,'type'),area_m2:val(form,'area')===''?null:Number(val(form,'area'))}:{})}).then(onDone)}>
 <ErrorNotice error={places.error||floors.error||buildings.error||types.error}/><p>{d.employee?`Сотрудник: ${d.employee.display_name}. Код места в старой системе: ${d.code||'не указан'}.`:d.name||legacyReason(d.reason)}</p>{d.employee&&<p>Текущее место: {places.data?.find(w=>w.id===d.current?.workplace_id)?.code||'не назначено'}. При подтверждении другого места прежнее назначение будет закрыто.</p>}
 <label>Подтверждённое действие<select required value={action} onChange={e=>setAction(e.target.value)}><option value="">Выберите решение</option>{d.employee?<><option value="assign">Назначить подтверждённое место</option><option value="unassigned">Подтвердить отсутствие постоянного места</option></>:<>{d.reason==='Missing floor'&&<option value="recover_room">Восстановить помещение на подтверждённом этаже</option>}<option value="exclude">Подтвердить: запись не подлежит переносу</option></>}</select></label>
 {action==='assign'&&<><label>Найти рабочее место<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Здание, этаж, комната или код"/></label><label>Свободное место<select required name="workplace" defaultValue=""><option value="">Выберите место ({available.length})</option>{available.slice(0,200).map(w=><option key={w.id} value={w.id}>{w.building_name} · этаж {w.floor_name} · комната {w.room_name||'не указана'} · место {w.code}</option>)}</select></label><p>Показаны первые 200 совпадений. Занятые, отключённые и забронированные места недоступны.</p></>}
 {action==='recover_room'&&<><label>Подтверждённый этаж<select required name="floor" defaultValue=""><option value="">Выберите этаж</option>{floors.data?.filter(f=>f.active).map(f=><option key={f.id} value={f.id}>{buildings.data?.find(b=>b.id===f.building_id)?.name} · этаж {f.name}</option>)}</select></label><Select name="type" label="Тип помещения" rows={types.data??[]}/><label>Площадь по документам, если известна<input name="area" type="number" min="0" step="0.01"/></label></>}
 {action==='exclude'&&<p>Это решение исключает запись из незавершённого переноса. Исходная запись остаётся в истории. Не выбирайте его только из-за отсутствия сведений.</p>}
 <label>Основание решения<textarea name="evidence" required minLength={10} maxLength={4000} placeholder="Кто подтвердил, какой документ или результат сверки, почему выбрано это решение"/></label><p>Данные и решение сохраняются одной операцией. Если место уже занято или назначение изменилось, операция будет отклонена.</p>
 </ActionForm>;
}

export function FloorScalePreview({floor}:{floor:Layout['floor']}){
 const p=useFacility('/floors/'+floor.id+'/scale-preview');
 return <details className="panel padded"><summary>Рассчитать площади по известным комнатам</summary><ErrorNotice error={p.error}/><p>Сравниваем площадь по документам с контуром каждой комнаты этого этажа. До подтверждения расчёт предварительный и не меняет аналитику.</p>{p.data&&<><p>Комнат для проверки: {p.data.sampleCount}. Расхождений более 10%: {p.data.conflicts}. Можно рассчитать неизвестные площади: {p.data.recoverable}. Нет пригодного контура: {p.data.withoutContour}.</p><p>{p.data.consistent?'Оценки масштаба согласуются. Проверьте комнаты на карте и подтвердите соответствие документов этому плану.':'Автоматическое применение недоступно: нужны минимум три известные площади без расхождений более 10%. Проверьте контуры и исходные площади.'}</p><DataTable rows={p.data.rooms} columns={[["name","Комната",r=><button onClick={()=>openFacilityResult({...r,kind:'room',floor_id:floor.id,building_id:floor.building_id})}>{r.name} · На карте</button>],["official","По документам, м²",r=>r.official??'Не указана'],["calculated","Предварительно по контуру, м²",r=>r.calculated==null?'Нет контура / масштаба':r.calculated.toFixed(2)],["deviation","Расхождение",r=>r.deviation==null?'—':(r.deviation*100).toFixed(1)+'%']]}/>{p.data.consistent&&<ActionForm key={p.data.version} title="Подтверждение масштаба этажа" label="Подтвердить и рассчитать площади" submit={d=>api('/floors/'+floor.id+'/scale-confirm',{expectedVersion:p.data.version,confirmed:true,evidence:val(d,'evidence')})}><label>Основание проверки<input name="evidence" required minLength={10} placeholder="По каким документам сверены комнаты и план"/></label><label><input type="checkbox" required/>Подтверждаю, что известные площади соответствуют этим контурам и весь этаж выполнен в одном масштабе.</label><p>Заполнятся расчётные площади. Площади по документам останутся прежними и сохранят приоритет.</p></ActionForm>}</>}</details>;
}

export function MapInventoryCheck({item}:{item:any}){
 return <ActionForm key={item.id} title="Проверка предмета на карте" label="Подтвердить проверку предмета" submit={d=>api('/inventory/'+item.id,{inventory_number:val(d,'number').trim()||null,condition:val(d,'condition'),note:val(d,'note')},'PATCH')}>
 <p>{item.checked_at?'Последняя проверка: '+new Date(item.checked_at).toLocaleString('ru'):'Этот предмет ещё не проверен в Facility Space.'}</p>
 <Input label="Инвентарный номер" name="number" value={item.inventory_number??''} required={false}/>
 <Select label="Состояние предмета" name="condition" value={item.condition||'in_use'} rows={[{id:'in_use',name:'Используется'},{id:'stored',name:'На хранении'},{id:'repair',name:'В ремонте'},{id:'retired',name:'Списано'}]}/>
 <Input label="Результат осмотра" name="note" value={item.inventory_note??''} required={false}/>
 <p>Подтверждайте после сверки предмета. Сохранится номер, состояние, примечание, время и автор проверки.</p>
 </ActionForm>;
}
