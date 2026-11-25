import {LayoutEditor} from './layout-editor';
import {DrawerAction,RegistryShell,StatusChip,templateGroups,TemplatePreview} from './workspace-ui';
import {ControlOverview,RoomsRegistry,NewBuildingAction,FloorRegistry,EditorPalette,ControlAssignment} from './control-center';
import { floorDrawingBounds } from './floor-fit';
import {AvailabilitySearch,EmployeeInspector,MyBookings,employeePlaceLabel,intervalLabel,initials,locationLabel} from './employee';
import { placeLabel } from './display';
import { Leases, FurnitureLibrary, MapBooking, Calibration, ImportCenter, BuildingWizard, RoomFacts, Spaces, CorporateOverview } from './corporate';
import { SearchSelect } from './search-select';
import { furnitureVisual } from './furniture-visual';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  useMutation,
} from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import type { Actor, Building, Employee, Floor, Furniture, Layout, Room } from '@office/shared';
import { api, demo } from './api';
import { useUI, type Screen } from './store';
import './style.css';
import {
  Dashboard,
  QualityQueue,
  UnifiedFacilitySearch,
  GlobalSearch,
  DataTable,
  RoomAreaHistory,
  RoomParameters,
  FloorScalePreview,
  MapInventoryCheck,
  BookingPage,
  Inventory,
  Catalog,
  Managers,
  History,
  EditorTools,
  LayoutVersions,
  RateHistory,
  WorkplacesPage,
  ParkingAdmin,
  RoomDrawForm,
} from './facility';
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false } },
});
function useData<T = any>(key: string, path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [key, path, useUI((s) => s.demoRole), useUI((s) => s.token)],
    queryFn: () => api<T>(path),
    enabled,
  });
}
const labels: Record<Screen, string> = {
  my:'Моё место', leases:'Аренда', library:'Библиотека мебели', quality:'Качество данных', spaces:'Помещения', imports:'Импорт данных',
  dashboard: 'Сегодня',
  booking: 'Бронирования',
  inventory: 'Инвентарь',
  catalog: 'Настройки',
  managers: 'Ответственные',
  history: 'История',
  workplaces: 'Рабочие места',
  offices: 'Здания',
  building: 'Обзор здания',
  floor: 'Карта этажа',
  people: 'Поиск людей',
  departments: 'Команды',
  admin: 'Площади и стоимость',
  parking: 'Парковка',
  editor: 'Редактор планировки',
};
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    offices: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h2m4 0h2M8 11h2m4 0h2M10 21v-5h4v5" />
      </>
    ),
    floor: (
      <>
        <path d="M3 3h18v18H3zM3 10h11V3m0 7v11M3 16h11" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0112 0v3m1-16a3 3 0 010 6m2 4a4 4 0 013 4v2" />
      </>
    ),
    departments: (
      <>
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <path d="M12 7v5H5v4m7-4h7v4" />
        <rect x="2" y="16" width="6" height="5" rx="1" />
        <rect x="16" y="16" width="6" height="5" rx="1" />
      </>
    ),
    admin: (
      <>
        <path d="M4 20V10m8 10V4m8 16v-7M2 20h20" />
      </>
    ),
    editor: (
      <>
        <path d="m3 17 12-12 4 4L7 21H3zm10-10 4 4m0-8 2-2 4 4-2 2" />
      </>
    ),
    parking: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M9 18V7h4a3 3 0 010 6H9" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.offices}
    </svg>
  );
}
function Loading() {
  return <div className="empty">Загружаем пространство…</div>;
}
function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}
function App() {
  const ui = useUI(),
    set = ui.set,
    qc = useQueryClient();
  const me = useData<Actor>('me', '/me', demo || !!ui.token);
  useEffect(() => {
    if (!demo && me.data && ui.demoRole !== me.data.role) set({ demoRole: me.data.role });
  }, [me.data?.role, ui.demoRole]);
  const buildings = useData<Building[]>('buildings', '/buildings', !!me.data);
  const floors = useData<Floor[]>(
    'floors',
    '/floors' + (ui.buildingId ? '?buildingId=' + encodeURIComponent(ui.buildingId) : ''),
    !!me.data,
  );
  const [login, setLogin] = useState('');
  const [searchOpen,setSearchOpen]=useState(false),[userOpen,setUserOpen]=useState(false);
  const own=useData<any>('own-menu','/me/workplace',!!me.data);
  const profile=useData<any>('profile','/me/profile',!!me.data);
  const parkingMenu=useData<any[]>('parking-menu','/parking',!!me.data);
  const showOwn=()=>{setUserOpen(false);if(own.data)set({screen:'floor',buildingId:own.data.building_id,floorId:own.data.floor_id,selected:own.data.furniture_id,bookingInterval:undefined,bookingDesk:false});else set({screen:'floor'});};
  useEffect(()=>{const shortcut=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[]);
  useEffect(()=>{window.scrollTo({top:0});},[ui.screen]);
  const canManage = me.data?.role === 'admin' || me.data?.role === 'facilities';
  useEffect(() => {
    if (!ui.buildingId && buildings.data?.length) set({ buildingId: (buildings.data.find(b=>b.workplaces>0)??buildings.data[0]).id });
  }, [buildings.data]);
  useEffect(() => {
    if (floors.data?.length && !floors.data.some((f) => f.id === ui.floorId))
      set({ floorId: floors.data[0].id, selected: null });
  }, [floors.data]);
  if (!demo && !ui.token)
    return (
      <div className="login">
        <div className="brand">
          <b>◈</b> facility<span>space</span>
        </div>
        <h1>Ваше рабочее пространство</h1>
        <p>
          Вход через корпоративный шлюз будет подключён после согласования с IT. Для пилота
          используйте выданный access token.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem('office-token', login);
            set({ token: login });
          }}
        >
          <label>
            Access token
            <input
              type="password"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
          </label>
          <button className="primary">Войти</button>
        </form>
      </div>
    );
  return (
    <div className={canManage?"shell aho-shell":"shell employee-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <b>◈</b> facility<span>space</span>
        </div>
        <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {(
            [
              ...(canManage ? ['dashboard','floor','spaces','workplaces','inventory','booking','parking','leases','admin','quality','history','offices','imports','managers','editor','library','catalog'] : ['floor','offices','people','booking']),
              
            ] as Screen[]
          ).map((s) => (
            <React.Fragment key={s}>{canManage&&({floor:'Пространство',inventory:'Активы и операции',leases:'Недвижимость',quality:'Контроль',offices:'Управление'} as any)[s]&&<div className="nav-group">{({floor:'Пространство',inventory:'Активы и операции',leases:'Недвижимость',quality:'Контроль',offices:'Управление'} as any)[s]}</div>}<button
              key={s}
              className={ui.screen === s ? 'active' : ''}
              onClick={() => set({ screen: s, ...(!canManage?{selected:null}:{}) })}
            >
              <Icon name={s} />
              {!canManage?({floor:'Карта',offices:'Здания',people:'Люди',booking:'Мои бронирования'} as any)[s]??labels[s]:({dashboard:'Сегодня',floor:'Карта',inventory:'Инвентарь',history:'История',catalog:'Настройки',offices:'Здания'} as any)[s]??labels[s]}
            </button></React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> Управление офисами
          <p>{demo ? 'Локальный пилот' : 'Корпоративный офис'}</p>
          <div className="profile">
            <span className="avatar">{demo ? 'ЛП' : '•'}</span>
            <div>
              {me.data?.role === 'employee'
                ? 'Сотрудник'
                : me.data?.role === 'admin'
                  ? 'Администратор'
                  : 'АХО'}
              <small>{demo ? 'Локальный проверяющий' : 'Корпоративный доступ'}</small>
            </div>
          </div>
          {demo ? (
            <label className="role-label">
              Демо-роль
              <select
                aria-label="Демо-роль"
                value={ui.demoRole}
                onChange={(e) => {
                  set({ demoRole: e.target.value as Actor['role'], screen: e.target.value==='employee'?'floor':'dashboard' });
                  qc.clear();
                }}
              >
                <option value="employee">Сотрудник</option>
                <option value="facilities">АХО</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
          ) : (
            <button
              onClick={() => {
                sessionStorage.removeItem('office-token');
                set({ token: '' });
                qc.clear();
              }}
            >
              Выйти
            </button>
          )}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button className="search-shortcut omnibox-trigger" onClick={()=>setSearchOpen(true)}>⌕ Найти человека, помещение или рабочее место… <kbd>⌘ K</kbd></button>
          <div className="user-menu-anchor"><button className="avatar small" aria-label="Меню пользователя" aria-expanded={userOpen} onClick={()=>setUserOpen(v=>!v)}>{demo?'ЛП':'Я'}</button>
          {userOpen&&<div className="user-menu panel"><strong>{profile.data?.display_name||'Мой профиль'}</strong><small>{me.data?.role==='admin'?'Администратор':canManage?'АХО':'Сотрудник'}</small><div className="profile-workplace"><small>Рабочее место</small>{own.data?<><strong>{employeePlaceLabel(own.data.code)}</strong><small>{locationLabel(own.data)}</small><button onClick={showOwn}>Показать на карте</button></>:<span>Не назначено</span>}</div><button onClick={()=>{set({screen:'booking'});setUserOpen(false);}}>Мои бронирования</button>{!!parkingMenu.data?.length&&<button onClick={()=>{set({screen:'parking'});setUserOpen(false);}}>Моя парковка</button>}{!demo&&<button onClick={()=>{sessionStorage.removeItem('office-token');set({token:''});qc.clear();}}>Выйти</button>}</div>}</div>
          {searchOpen&&<GlobalSearch onClose={()=>setSearchOpen(false)}/>}
          {!canManage&&ui.bookingSearch&&<AvailabilitySearch onClose={()=>set({bookingSearch:false})}/>}
        </header>
        <div className={"page "+(!canManage&&ui.screen==='floor'?'employee-map-page':canManage&&['floor','editor'].includes(ui.screen)?'aho-map-page':'')}>
          <ErrorBox error={me.error || buildings.error || floors.error} />
          {!me.data ? (
            <Loading />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <h1>{!canManage?({floor:'Карта',people:'Люди',booking:'Мои бронирования'} as any)[ui.screen]??labels[ui.screen]:labels[ui.screen]}</h1>
                  {ui.screen === 'catalog' && <p>Здесь добавляют здания, этажи, типы помещений и мебели.</p>}
                  {ui.screen === 'editor' && <p>Рисуйте помещения, меняйте контуры и расстановку. Все правки сохраняются вместе.</p>}
                </div>
                <span className="badge">{demo ? '● Локальный пилот' : '● Подключено'}</span>
              </div>
              {!canManage&&ui.screen==='floor'&&<MyWorkplace/>}
              {ui.screen==='my'?<MyWorkplace/>:ui.screen === 'imports' && canManage ? <ImportCenter/> : ui.screen === 'leases' && canManage ? <Leases/> : ui.screen === 'library' && canManage ? <FurnitureLibrary/> : ui.screen === 'quality' && canManage ? <QualityQueue/> : ui.screen==='spaces'&&canManage?<RoomsRegistry/>:ui.screen === 'dashboard' && canManage ? (
                <ControlOverview />
              ) : ui.screen === 'inventory' && canManage ? (
                <Inventory />
              ) : ui.screen === 'catalog' && canManage ? (
                <Catalog actor={me.data} />
              ) : ui.screen === 'managers' && canManage ? (
                <Managers actor={me.data} />
              ) : ui.screen === 'history' && canManage ? (
                <History />
              ) : ui.screen === 'booking' ? (
                canManage?<BookingPage actor={me.data} />:<MyBookings/>
              ) : ui.screen === 'workplaces' ? (
                <WorkplacesPage actor={me.data} />
              ) : ui.screen === 'offices' ? (
                <>{canManage&&<div className="section-heading"><span>Реестр зданий компании</span><NewBuildingAction/></div>}<Offices buildings={buildings.data ?? []} /></>
              ) : ui.screen === 'building' ? (
                <BuildingView actor={me.data}
                  building={buildings.data?.find((b) => b.id === ui.buildingId)}
                  floors={floors.data ?? []}
                />
              ) : ui.screen === 'people' ? (
                <People />
              ) : ui.screen === 'parking' ? (
                <>
                  <Parking actor={me.data} buildings={buildings.data ?? []} />
                  
                </>
              ) : ui.screen === 'admin' && canManage ? (
                <Admin buildings={buildings.data ?? []} />
              ) : (
                <>
                  <div className="context-bar">
                    <label>
                      Здание
                      <select
                        value={ui.buildingId}
                        onChange={(e) =>
                          set({ buildingId: e.target.value, floorId: '', selected: null })
                        }
                      >
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
                        value={ui.floorId}
                        onChange={(e) => set({ floorId: e.target.value, selected: null })}
                      >
                        {floors.data?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!canManage&&<button className="primary employee-book-cta" onClick={()=>set({bookingSearch:true})}>Забронировать место</button>}
                    <span className="context-note">
                      {ui.screen === 'editor'
                        ? 'Изменения проходят проверку на сервере'
                        : 'Выберите место на карте, чтобы узнать больше'}
                    </span>
                  </div>
                  {ui.floorId ? (ui.screen === 'editor' && canManage ? <LayoutEditor key={ui.floorId}/> :
                    <FloorExplorer
                      actor={me.data}
                      editing={ui.screen === 'editor' && !!canManage}
                      departmentsMode={true}
                    />
                  ) : (
                    <div className="empty">Выберите доступный этаж</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function Offices({ buildings }: { buildings: Building[] }) {
  const set = useUI((s) => s.set);
  const total = buildings.reduce((a, b) => a + b.workplaces, 0),
    occupied = buildings.reduce((a, b) => a + b.occupied + (b.reserved ?? 0), 0);
  return (
    <>
      <div className="hero">
        <div>
          <h2>Карта офисов</h2>
          <p>Выберите здание и этаж, чтобы посмотреть помещения и рабочие места.</p>
          <button onClick={() => set({ screen: 'floor' })}>
            Открыть карту <span>↗</span>
          </button>
        </div>
        <div className="hero-plan" aria-hidden="true">
          <div className="plan-room a">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="plan-room b">
            <i />
            <i />
            <i />
          </div>
          <div className="plan-room c">
            <i />
            <i />
            <i />
          </div>
          <div className="plan-room d">
            <i />
            <i />
          </div>
          <span className="plan-pin">
            Вы здесь <b>●</b>
          </span>
        </div>
      </div>
      <div className="stats office-overview-stats">
        <Stat label="Рабочих мест" value={total.toLocaleString('ru-RU')} />
        <Stat label="Свободно сейчас" value={Math.max(0, total - occupied).toLocaleString('ru-RU')} green />
      </div>
      <div className="section-heading">
        <h2>Наши офисы</h2>
        <span>Всего: {buildings.length}</span>
      </div>
      <div className="building-grid">
        {buildings.map((b, i) => (
          <button
            className="building-card"
            key={b.id}
            onClick={() => set({ screen: 'building', buildingId: b.id, floorId: '' })}
          >
            <div className={'building-art art-' + (i % 3)}>
              <div className="architectural">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>{b.city || 'Город не указан'}</span>
            </div>
            <div className="building-body">
              <h3>
                {b.name} <span>↗</span>
              </h3>
              <p>{b.address || 'Адрес требует уточнения'}</p>
              <div className="building-availability">
                <div className="availability-heading">
                  <span>Свободно сейчас</span>
                  <strong>{Math.max(0, b.workplaces - b.occupied - (b.reserved ?? 0))}<small> из {b.workplaces}</small></strong>
                </div>
                <div className="availability-track" aria-hidden="true">
                  <span style={{width: `${b.workplaces ? Math.max(0, Math.min(100, (b.workplaces - b.occupied - (b.reserved ?? 0)) / b.workplaces * 100)) : 0}%`}} />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  green = false,
}: {
  label: string;
  value: React.ReactNode;
  green?: boolean;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={green ? 'green' : ''}>{value}</strong>
    </div>
  );
}
function BuildingView({ building, floors, actor }: { building?: Building; floors: Floor[]; actor:Actor }) {
  const set = useUI((s) => s.set);
  return (
    <>
      <div className="summary-panel">
        <div>
          <span className="eyebrow">ЗДАНИЕ</span>
          <h2>{building?.name}</h2>
          <p>
            {building?.city} · {building?.address}
          </p>
        </div>
        <Icon name="offices" />
      </div>
      <div className="stats">
        <Stat label="Этажей" value={floors.length} />
        <Stat label="Рабочих мест" value={building?.workplaces ?? 0} />
        <Stat label="Занято" value={building?.occupied ?? 0} />
        <Stat label="Свободно" value={Math.max(0,(building?.workplaces??0)-(building?.occupied??0)-(building?.reserved??0))} green />
      </div>
      <section className="floor-picker" aria-label="Выбор этажа">
      <h2>Этажи</h2>{actor.role!=='employee'&&<Catalog actor={actor} section="building"/>}
      <div className="floor-picker-buttons">
        {floors.map((f) => (
          <button
            className="floor-picker-button"
            key={f.id}
            onClick={() => set({ screen: 'floor', buildingId:f.building_id, floorId: f.id, selected:null, bookingInterval:undefined })}
          >
            {/этаж/i.test(f.name) ? f.name : `Этаж ${f.name}`}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      </section>
    </>
  );
}
function FloorExplorer({
  actor,
  editing,
  departmentsMode,
}: {
  actor: Actor;
  editing: boolean;
  departmentsMode: boolean;
}) {
  const ui = useUI(),
    qc = useQueryClient();
  const employeeMode=actor.role==='employee';
  const [freeRoom,setFreeRoom]=useState<string|null>(null);
  const allBuildings=useData<Building[]>('buildings','/buildings');
  const query = useData<Layout>('layout', '/floors/' + encodeURIComponent(ui.floorId) + '/layout');
  const departments = useData<any[]>('departments', '/departments');
  const [draft, setDraft] = useState<
    Record<string, { x: number; y: number; rotation: number; width?: number; depth?: number }>
  >({});
  const [undoDrafts, setUndoDrafts] = useState<(typeof draft)[]>([]);
  const [redoDrafts, setRedoDrafts] = useState<(typeof draft)[]>([]);
  const dragCheckpoint = useRef(false);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mapMode,setMapMode]=useState('occupancy');
  const [availabilityOpen,setAvailabilityOpen]=useState(false);
  const [localBookingStart,setBookingStart]=useState(''),[localBookingEnd,setBookingEnd]=useState('');
  const bookingStart=employeeMode?ui.bookingInterval?.start??'':localBookingStart,bookingEnd=employeeMode?ui.bookingInterval?.end??'':localBookingEnd;
  const validBooking=!!bookingStart&&!!bookingEnd&&Date.parse(bookingEnd)>Date.parse(bookingStart);
  const availability=useData<any[]>('floor-availability','/floors/'+ui.floorId+'/booking-availability?'+(validBooking?new URLSearchParams({startsAt:new Date(bookingStart).toISOString(),endsAt:new Date(bookingEnd).toISOString()}):''),validBooking&&!editing);
  const leaseLayer=useData<any[]>('floor-leases','/floors/'+ui.floorId+'/leases',actor.role!=='employee'&&mapMode==='lease');
  const [calibrationPoints,setCalibrationPoints]=useState<[number,number][]>([]),[calibrating,setCalibrating]=useState(false);
  const [areaMetric,setAreaMetric]=useState('official');
  const [mapView,setMapView]=useState(true),[leaseSelecting,setLeaseSelecting]=useState(!!ui.leasePicking);
  const tenantColor=(id:string)=>['#b6cce9','#d5c4e7','#c2dbb2','#f0d1aa','#b9dedd','#e8bfcb'][[...id].reduce((s,c)=>s+c.charCodeAt(0),0)%6];
  const [uncheckedOnly,setUncheckedOnly]=useState(false);
  const [pickingFurniture,setPickingFurniture]=useState(false);
  const [furniturePoint,setFurniturePoint]=useState<{x:number;y:number}|null>(null);
  const [dropTemplate,setDropTemplate]=useState('');
  
  const types=useData<any[]>('space-types','/space-types');
  const mapCosts=useData<any[]>('map-costs','/costs',actor.role!=='employee'&&mapMode==='cost');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tableHeight, setTableHeight] = useState(280);
  const [notice, setNotice] = useState('');
  const [drawing, setDrawing] = useState(false),
    [points, setPoints] = useState<[number, number][]>([]),
    [drawRoom, setDrawRoom] = useState<string | null>(null),
    [drawVersion, setDrawVersion] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const emptyPointer=useRef<{x:number;y:number}|null>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    setDraft({});setFreeRoom(null);
    setPickingFurniture(false);setFurniturePoint(null);setCalibrationPoints([]);setCalibrating(false);
    setUndoDrafts([]);
    setRedoDrafts([]);
    setBaseVersion(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNotice('');
    ui.set({department:''});
    setDrawing(false);
    setPoints([]);
  }, [ui.floorId, editing]);
  useEffect(()=>{if(editing&&query.data&&ui.pendingTemplate){setDropTemplate(ui.pendingTemplate);setPickingFurniture(true);ui.set({pendingTemplate:undefined});}},[editing,query.data,ui.pendingTemplate]);
  const [viewportRatio,setViewportRatio]=useState(1.6);
  useEffect(()=>{const element=svgRef.current;if(!element)return;const observer=new ResizeObserver(()=>{const r=element.getBoundingClientRect();if(r.width&&r.height)setViewportRatio(r.width/r.height);});observer.observe(element);return()=>observer.disconnect();},[query.data?.floor.id]);
  const fitEmployeeFloor=()=>{
    const layout=query.data;if(!layout)return;
    
    const bounds=floorDrawingBounds(layout);
    const rect=svgRef.current?.getBoundingClientRect();
    const ratio=rect?.width&&rect.height?rect.width/rect.height:viewportRatio;
    const width=layout.floor.width,height=width/ratio;
    const z=Math.min(width/(bounds.width*1.08),height/(bounds.height*1.08));
    setZoom(z);setPan({x:bounds.x+bounds.width/2-width/z/2,y:bounds.y+bounds.height/2-height/z/2});
  };
  const fittedFloor=useRef('');
  useEffect(()=>{if(query.data?.floor.id&&svgRef.current){if(fittedFloor.current!==query.data.floor.id){fittedFloor.current=query.data.floor.id;if(!ui.selected)fitEmployeeFloor();}}},[query.data?.floor.id,employeeMode,viewportRatio]);
  const focusSelection=()=>{
    const layout=query.data;if(!layout)return;
    const f=layout.furniture.find(f=>f.id===ui.selected);
    const r=layout.rooms.find(r=>r.id===(f?.room_id??ui.selected));
    if(f){setZoom(3);setPan({x:f.x-layout.floor.width/6,y:f.y-(layout.floor.width/viewportRatio)/6});}
    else if(r?.shape.polygon){const xs=r.shape.polygon.map(p=>p[0]),ys=r.shape.polygon.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;const z=Math.max(.25,Math.min(8,layout.floor.width/(w+80),layout.floor.height/(h+80)));setZoom(z);setPan({x:x-40,y:y-40});}
  };
  useEffect(()=>{if(!editing&&ui.selected){focusSelection();setMapView(true);}},[ui.selected,query.data?.floor.id]);
  const save = useMutation({
    mutationFn: () =>
      api(
        '/floors/' + ui.floorId + '/layout',
        {
          expectedVersion: baseVersion ?? query.data!.floor.version,
          changes: Object.entries(draft).map(([id, v]) => ({ id, ...v })),
          comment: 'Layout editor',
        },
        'PUT',
      ),
    onSuccess: () => {
      setDraft({});
      setUndoDrafts([]);
      setRedoDrafts([]);
      setBaseVersion(null);
      setNotice('Планировка сохранена');
      qc.invalidateQueries();
    },
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorBox error={query.error} />;
  const l = query.data;
  const furniture = l.furniture
    .filter((f) => f.active)
    .map((f) => ({
      ...f,
      ...draft[f.id],
      checked_at: (f as any).checked_at,
      condition: (f as any).condition,
      inventory_note: (f as any).inventory_note,
      room_name: l.rooms.find((r) => r.id === f.room_id)?.name,
      department_name: departments.data?.find((d) => d.id === f.department_id)?.name,
    }));
  const selected = furniture.find((f) => f.id === ui.selected),
    room = l.rooms.find((r) => r.id === (selected?.room_id ?? ui.selected));
  const selectedWorkplace = selected?.workplace_id;
  const position = (e: { clientX: number; clientY: number }) => {
    const p = svgRef.current!.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const matrix = svgRef.current!.getScreenCTM();
    return matrix ? p.matrixTransform(matrix.inverse()) : p;
  };
  const move = (
    id: string,
    values: { x: number; y: number; rotation: number; width?: number; depth?: number },
  ) => {
    if (!drag.current || !dragCheckpoint.current) {
      setUndoDrafts((items) => [...items.slice(-99), draft]);
      setRedoDrafts([]);
      if (drag.current) dragCheckpoint.current = true;
    }
    if (baseVersion === null) setBaseVersion(l.floor.version);
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...values } }));
  };
  const typePalette=['#bfdbfe','#fed7aa','#c4b5fd','#99f6e4','#fecdd3','#d9f99d','#e9d5ff','#fde68a'];
  const floorTypes=(types.data??[]).filter(t=>l.rooms.some(r=>r.active&&r.space_type_id===t.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const typeColor=(id:string)=>typePalette[Math.max(0,floorTypes.findIndex(t=>t.id===id))%typePalette.length];
  const roomColor=(r:Room)=>{
    if(room?.id===r.id&&['occupancy','rooms','inventory'].includes(mapMode))return '#e5efe7';
    if(employeeMode&&validBooking)return '#fcfdf9';
    if(mapMode==='type')return typeColor(r.space_type_id??"");
    if(mapMode==='type'){const category=types.data?.find(t=>t.id===r.space_type_id)?.category;return ({OFFICE:'#c5dfed',COMMON:'#e7ddb4',TECHNICAL:'#d3c5df',OTHER:'#ddd'} as any)[category]||'#ddd';}
    if(mapMode==='quality')return (r.area_m2===null&&(r as any).calculated_area_m2==null)||r.shape.needsReview?'#f1c4b5':'#d6e9d6';
    if(mapMode==='area'){const calc=(r as any).calculated_area_m2;if(areaMetric==='difference')return r.area_m2==null||calc==null?'#ddd':Math.abs(Number(calc)-Number(r.area_m2))/Math.max(1,Number(r.area_m2))>.1?'#efb4a7':'#b9dfce';const area=areaMetric==='calculated'?calc:r.area_m2;return area==null?'#ddd':Number(area)>100?'#83b6a0':Number(area)>30?'#b3d4bf':'#e2eee3';}
    if(mapMode==='cost'){const c=mapCosts.data?.find(c=>c.id===r.id);return c?.total_cost==null?'#ddd':'#d8caec';}
    return '#fcfdf9';
  };
  const vb = { x: pan.x, y: pan.y, w: l.floor.width / zoom, h: (l.floor.width/viewportRatio) / zoom };
  return (
    <>
      <ErrorBox error={query.error || save.error} />
      {notice && (
        <div role="status" className="success">
          {notice}
        </div>
      )}
      {editing && (
        <div className="editor-mobile">
          Редактор доступен на компьютере с шириной окна от 1024 px. Карта доступна для просмотра.
        </div>
      )}
      {!employeeMode&&!l.floor.background_svg && (
        <p className="panel padded">
          Исходная SVG-подложка отсутствует. Отображаются сохранённые контуры и объекты; масштаб и
          размеры требуют проверки.
        </p>
      )}
      {!editing&&!employeeMode&&<div className="booking-map-toolbar"><button aria-expanded={availabilityOpen} onClick={()=>setAvailabilityOpen(v=>!v)}>Найти место на время</button>{availabilityOpen&&<><label>Начало<input type="datetime-local" value={bookingStart} onChange={e=>setBookingStart(e.target.value)}/></label><label>Окончание<input type="datetime-local" value={bookingEnd} onChange={e=>setBookingEnd(e.target.value)}/></label><button disabled={!validBooking} onClick={()=>setAvailabilityOpen(false)}>Показать свободные</button></>}{validBooking&&<><span>{new Date(bookingStart).toLocaleString('ru')} — {new Date(bookingEnd).toLocaleString('ru')}</span><button onClick={()=>{setBookingStart('');setBookingEnd('');}}>Показать сейчас</button></>}{actor.role!=='employee'&&<div className="segmented"><button aria-pressed={mapView} onClick={()=>setMapView(true)}>Карта</button><button aria-pressed={!mapView} onClick={()=>setMapView(false)}>Таблица</button></div>}<ErrorBox error={availability.error}/></div>}
      {employeeMode&&validBooking&&<div className="employee-availability-bar"><span>Доступность: {intervalLabel({start:bookingStart,end:bookingEnd})}</span><small>{availability.isFetching?'Проверяем…':(availability.data?.filter(a=>a.status==='available').length??0)+' свободно'}</small><button onClick={()=>ui.set({bookingSearch:true})}>Изменить</button><button aria-label="Сбросить доступность" onClick={()=>{setMapMode('occupancy');setFreeRoom(null);ui.set({bookingInterval:undefined,bookingDesk:false});}}>×</button></div>}
      <div className="map-toolbar">{!employeeMode&&<label className="map-mode-control">Отображение<select aria-label="Режим карты" value={mapMode} onChange={e=>setMapMode(e.target.value)}><option value="occupancy">Занятость</option>{!employeeMode&&<option value="department">Подразделения</option>}<option value="type">Типы помещений</option>{actor.role!=='employee'&&<><option value="inventory">Инвентарь</option><option value="area">Площади</option><option value="quality">Качество данных</option></>}{actor.role!=='employee'&&<><option value="lease">Арендаторы</option></>}</select></label>}{actor.role!=='employee'&&<><DrawerAction title="Действия этажа"><Calibration floor={l.floor} points={calibrationPoints} onPick={()=>{document.dispatchEvent(new Event('facility-close-drawer'));setCalibrationPoints([]);setCalibrating(true);svgRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}} onCancel={()=>{setCalibrating(false);setCalibrationPoints([]);}}/></DrawerAction></>}
        <div className="legend" aria-label="Обозначения карты">
          {(employeeMode?(mapMode==='type'&&!validBooking?floorTypes.map(t=>[typeColor(t.id),t.name]):validBooking?[['#bbf7d0','Доступно'],['#cdd0d5','Недоступно'],['#2563eb','Выбрано']]:[['#fff','Свободно'],['#475569','Занято'],['#f5b942','Бронь'],['#7c3aed','Моё место'],['#2563eb','Выбрано']]):validBooking?[['#b8e3c6','Свободно на выбранное время'],['#aabbaf','Постоянное место'],['#edc181','Бронь'],['#c9c9c9','Недоступно']]:mapMode==='lease'?[]:mapMode==='department'?departments.data?.filter(d=>furniture.some(f=>f.department_id===d.id)).map(d=>[tenantColor(d.id),d.name])??[]:mapMode==='inventory'?[['#d58a2a','Не проверено'],['#478269','Проверено'],['#c66e58','Нет инвентарного номера']]:mapMode==='type'?floorTypes.map(t=>[typeColor(t.id),t.name]):mapMode==='area'?(areaMetric==='difference'?[['#ddd','Нет пары площадей'],['#efb4a7','Расхождение > 10%'],['#b9dfce','В пределах 10%']]:[['#ddd','Площадь не указана'],['#e2eee3','До 30 м²'],['#b3d4bf','30–100 м²'],['#83b6a0','Более 100 м²']]):mapMode==='quality'?[['#f1c4b5','Нет площади или контур требует проверки'],['#d6e9d6','Эти замечания отсутствуют']]:mapMode==='cost'?[['#ddd','Расчёт отсутствует'],['#d8caec','Стоимость рассчитана']]:[['#45a773','Свободно'],['#64748b','Занято'],['#d99a24','Бронь'],['#9ca3af','Недоступно']]).map(([color,label])=><span key={label}><i className={employeeMode&&label==='Выбрано'?'selection-legend':undefined} style={{background:employeeMode&&label==='Выбрано'?'transparent':color,border:'1px solid '+color}}/>{label}</span>)}
          {mapMode==='lease'&&leaseLayer.data?.length===0&&<span>Действующих договоров для этажа нет</span>}{mapMode==='lease'&&[...new Map((leaseLayer.data??[]).map(l=>[l.tenant_id,l])).values()].map(l=><span key={l.tenant_id}><i style={{background:tenantColor(l.tenant_id)}}/>{l.tenant_name}</span>)}{!employeeMode&&ui.selected && <span><i className="selected"/>Выбранный объект</span>}
        </div>
        <div className="toolbar-actions">
          {actor.role!=='employee'&&!editing&&mapMode==='lease'&&<><button onClick={()=>setLeaseSelecting(v=>!v)}>{leaseSelecting?'Завершить выбор помещений':'Выбрать помещения для аренды'}</button>{!!ui.leaseRooms?.length&&<button onClick={()=>ui.set({screen:'leases',leasePicking:false})}>Продолжить аренду ({ui.leaseRooms.length})</button>}</>}
          {!employeeMode && mapMode==='department' && (
            <SearchSelect label="Подразделение" value={ui.department} onChange={department=>ui.set({department})} options={[{id:'',label:'Все подразделения'},...(departments.data??[]).filter(d=>furniture.some(f=>f.department_id===d.id)).map(d=>({id:d.id,label:d.name.startsWith('Bitrix department ')?'Подразделение №'+d.name.replace('Bitrix department ','')+' — название не получено':d.name}))]} />
          )}
          {editing && <span className="version">Версия планировки {l.floor.version}</span>}
          {editing && (
            <>
              <button
                className="desktop-editor"
                disabled={drawing || !!Object.keys(draft).length}
                onClick={() => {
                  setDrawing(true);
                  setPoints([]);
                  setDrawRoom(null);
                  setDrawVersion(l.floor.version);
                }}
              >
                Нарисовать помещение
              </button>
              {room && !selected && (
                <button
                  className="desktop-editor"
                  disabled={drawing || !!Object.keys(draft).length}
                  onClick={() => {
                    setDrawing(true);
                    setPoints([]);
                    setDrawRoom(room.id);
                    setDrawVersion(l.floor.version);
                  }}
                >
                  Изменить контур
                </button>
              )}
              <button className="desktop-editor" disabled={!undoDrafts.length || save.isPending} onClick={() => {
                setRedoDrafts((items) => [...items, draft]);
                setDraft(undoDrafts[undoDrafts.length - 1]);
                setUndoDrafts((items) => items.slice(0, -1));
              }}>Шаг назад</button>
              <button className="desktop-editor" disabled={!redoDrafts.length || save.isPending} onClick={() => {
                setUndoDrafts((items) => [...items, draft]);
                setDraft(redoDrafts[redoDrafts.length - 1]);
                setRedoDrafts((items) => items.slice(0, -1));
              }}>Шаг вперёд</button>
              <button
                className="desktop-editor"
                disabled={!Object.keys(draft).length}
                onClick={() => {
                  setDraft({});
                  setUndoDrafts([]);
                  setRedoDrafts([]);
                  setBaseVersion(null);
                }}
              >
                Отменить
              </button>
              <button
                className="primary desktop-editor"
                disabled={!Object.keys(draft).length || save.isPending}
                onClick={() => save.mutate()}
              >
                Сохранить планировку
              </button>
            </>
          )}
        </div>
      </div>

      <div className={"explorer-grid"+(editing?" aho-editor-grid":"")} style={!mapView&&!editing?{display:'none'}:undefined}>
        {editing&&<EditorPalette onChoose={id=>{setDropTemplate(id);setFurniturePoint(null);setPickingFurniture(true);}}/>}
        <section className="map-panel">
          <div className="map-title">
            <div className="map-heading"><strong>Этаж {l.floor.name}</strong><div className="map-counts"><span>Помещения <b>{l.rooms.filter((r) => r.active).length}</b></span><span>Рабочие места <b>{furniture.filter((f) => f.workplace_id).length}</b></span></div></div>{employeeMode&&<label className="map-mode-control">Отображение<select aria-label="Режим карты" value={mapMode} onChange={e=>setMapMode(e.target.value)}><option value="occupancy">Занятость</option>{!employeeMode&&<option value="department">Подразделения</option>}<option value="type">Типы помещений</option>{actor.role!=='employee'&&<><option value="inventory">Инвентарь</option><option value="area">Площади</option><option value="quality">Качество данных</option></>}{actor.role!=='employee'&&<><option value="lease">Арендаторы</option></>}</select></label>}
          </div>
          {!employeeMode&&mapMode==='area'&&<label className="area-metric">Показатель<select value={areaMetric} onChange={e=>setAreaMetric(e.target.value)}><option value="official">По документам</option><option value="calculated">По плану</option><option value="difference">Расхождение более 10%</option></select></label>}
          <div className="map-mode-help" hidden={employeeMode}>
            {calibrating&&<p role="status">Укажите {calibrationPoints.length===0?'первую':'вторую'} точку контрольного расстояния. После выбора вернитесь к форме масштаба. <button onClick={()=>{setCalibrating(false);setCalibrationPoints([]);}}>Отмена</button></p>}{pickingFurniture&&<p role="status">Нажмите внутри помещения в точке, где должен находиться центр нового предмета. <button onClick={()=>setPickingFurniture(false)}>Отмена</button></p>}
            {furniture.length===0 && <p role="status">В данных этого этажа нет отдельных объектов мебели. Это не подтверждает, что этаж пустой: расстановку нужно уточнить по актуальному плану.</p>}
            {furniture.length>0 && furniture.every(f=>f.x===0&&f.y===0) && <p role="status">Все объекты мебели этого этажа находятся в начале координат плана (0, 0). По этим данным нельзя подтвердить расстановку; нужен актуальный план или уточнение координат.</p>}
            {mapMode==='inventory'?<><p>Нажмите на предмет мебели и подтвердите его номер и состояние в карточке справа. Проверено {furniture.filter(f=>f.checked_at).length} из {furniture.length} предметов.</p><label><input type="checkbox" checked={uncheckedOnly} onChange={e=>setUncheckedOnly(e.target.checked)}/>Показать только непроверенные предметы</label></>:<p>{({occupancy:'Нажмите на рабочее место: в карточке доступны сотрудник и действия размещения.',rooms:'Нажмите внутри комнаты, чтобы изменить её название, назначение или площадь.',type:'Цвет показывает класс помещения. Нажмите на комнату, чтобы изменить её назначение.',area:'Цвет показывает площадь по документам. Нажмите на комнату, чтобы внести или исправить значение.',quality:'Нажмите на комнату с замечанием: справа указана причина и доступны параметры помещения.',cost:'Нажмите на комнату, чтобы увидеть стоимость или причину отсутствия расчёта.'} as Record<string,string>)[mapMode]}</p>}
          </div>
          <svg
            ref={svgRef}
            onDragOver={e=>{if(editing)e.preventDefault();}}
            onDrop={e=>{if(!editing)return;e.preventDefault();const template=e.dataTransfer.getData('application/x-facility-template');if(!template)return;const p=position(e);setDropTemplate(template);setFurniturePoint({x:Math.round(p.x),y:Math.round(p.y)});setNotice('Положение выбрано. Проверьте параметры и нажмите «Добавить на этаж» ниже.');}}
            onClickCapture={(e) => {
              if(calibrating){e.stopPropagation();const p=position(e);setCalibrationPoints(old=>[...old,[p.x,p.y]]);if(calibrationPoints.length===1)setCalibrating(false);return;}
              if(pickingFurniture){e.stopPropagation();const p=position(e);setFurniturePoint({x:Math.round(p.x),y:Math.round(p.y)});setPickingFurniture(false);return;}
              if (drawing) {
                e.stopPropagation();
                const p = position(e);
                setPoints((v) => [...v, [Math.round(p.x), Math.round(p.y)]]);
              }
            }}
            onPointerDownCapture={(e) => {
              if (drawing || pickingFurniture || calibrating) e.stopPropagation();
            }}
            role="img"
            aria-label="Карта этажа"
            className={'floor-map ' + (editing ? 'editing' : '')}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                emptyPointer.current={x:e.clientX,y:e.clientY};
                const p = position(e);
                panDrag.current = { x: p.x, y: p.y, px: pan.x, py: pan.y };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (drag.current) {
                const p = position(e),
                  f = furniture.find((f) => f.id === drag.current!.id)!;
                move(f.id, {
                  x: Math.round(p.x - drag.current.dx),
                  y: Math.round(p.y - drag.current.dy),
                  rotation: f.rotation,
                });
              } else if (panDrag.current) {
                const p = position(e);
                setPan({ x: pan.x + panDrag.current.x - p.x, y: pan.y + panDrag.current.y - p.y });
              }
            }}
            onPointerUp={(e) => {
              if(employeeMode&&emptyPointer.current&&Math.hypot(e.clientX-emptyPointer.current.x,e.clientY-emptyPointer.current.y)<4){ui.set({selected:null,bookingDesk:false});setFreeRoom(null);}emptyPointer.current=null;
              drag.current = null;
              panDrag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
              panDrag.current = null;
            }}
          >
            <defs>
              <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r=".9" fill="#dce3de" />
              </pattern>
            {employeeMode&&<><filter id="employee-own-fill" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .486 0 0 0 0 .227 0 0 0 0 .929 0 0 0 1 0"/></filter><filter id="employee-booked-fill" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 .85 0 0 0 0 .59 0 0 0 0 .20 0 0 0 1 0"/></filter></>}
            </defs>
            <rect
              x={-100000}
              y={-100000}
              width={200000}
              height={200000}
              fill="url(#grid)"
              pointerEvents="none"
            />
            {l.floor.background_svg && (
              <image
                href={
                  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(l.floor.background_svg)
                }
                x={0}
                y={0}
                width={l.floor.width}
                height={l.floor.height}
                pointerEvents="none"
              />
            )}
            {l.rooms
              .filter((r) => r.active)
              .map((r) => (
                <g key={r.id} role="button" tabIndex={0} aria-label={"Помещение "+r.name} aria-pressed={ui.selected===r.id} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ui.set({selected:r.id});}}} onClick={() => {if(leaseSelecting){if(types.data?.find(t=>t.id===r.space_type_id)?.category!=='OFFICE'){setNotice('Выберите офисное помещение. Общие площади добавляются на следующем шаге договора.');return;}ui.set({leaseRooms:ui.leaseRooms?.includes(r.id)?ui.leaseRooms.filter(x=>x!==r.id):[...(ui.leaseRooms??[]),r.id]});}else ui.set({ selected: r.id });}} className="room-shape">
                  {r.shape.polygon ? (
                    <polygon
                      points={r.shape.polygon.map((p) => p.join(',')).join(' ')}
                      fill={mapMode==='lease'?(leaseLayer.data?.some(x=>x.room_id===r.id)?tenantColor(leaseLayer.data.find(x=>x.room_id===r.id)!.tenant_id):'#eeeeea'):roomColor(r)}
                      fillOpacity={employeeMode&&mapMode==='type'&&!validBooking?.8:l.floor.background_svg ? 0.45 : 1}
                      stroke={ui.selected===r.id||leaseSelecting&&ui.leaseRooms?.includes(r.id)?employeeMode?'#2563eb':'#ce7500':'#a9b8ae'}
                      strokeWidth={ui.selected===r.id||leaseSelecting&&ui.leaseRooms?.includes(r.id)?8:3}
                    />
                  ) : r.shape.path ? (
                    <path d={r.shape.path} fill={employeeMode?roomColor(r):"#f7f4e8"} stroke={ui.selected===r.id?'#ce7500':'#b8b8a3'} strokeWidth={ui.selected===r.id||leaseSelecting&&ui.leaseRooms?.includes(r.id)?8:3} />
                  ) : null}
                  {r.shape.polygon && (!employeeMode||zoom>=1.7) && (
                    <text
                      x={Math.min(...r.shape.polygon.map((p) => p[0])) + 18}
                      y={Math.min(...r.shape.polygon.map((p) => p[1])) + 30}
                      fontSize="15"
                      fill="#4b6054"
                    >
                      {r.name}
                    </text>
                  )}
                </g>
              ))}
            {furniture.filter(f=>(mapMode!=='inventory'||!uncheckedOnly||!f.checked_at)).map((f) => {
              const visual = furnitureVisual(f);
              const color =
                ui.selected === f.id
                  ? '#f2b96b'
                  : validBooking&&f.workplace_id ? ({available:'#b8e3c6',occupied:'#aabbaf',booked:'#edc181',disabled:'#c9c9c9'} as any)[availability.data?.find(x=>x.furniture_id===f.id)?.status??'disabled'] : mapMode==='inventory' ? (!f.inventory_number?'#c66e58':f.checked_at?'#478269':'#d58a2a') : f.employee_id || f.reserved
                    ? '#b4c5bb'
                    : '#def0e3';
              const faded = !employeeMode && mapMode==='department' && ui.department && f.department_id !== ui.department;
              const state=validBooking?availability.data?.find(a=>a.furniture_id===f.id)?.status: f.employee_id===actor.employeeId?'own':f.employee_id?'occupied':f.reserved?'booked':f.status==='disabled'?'disabled':'available';
              const selectedDesk=ui.selected===f.id;
              const employeeColor=validBooking?(state==='available'?'#bbf7d0':'#cbd5e1'):({available:validBooking||freeRoom?'#bbf7d0':'#ffffff',occupied:'#475569',booked:'#f5b942',own:'#7c3aed',disabled:'#cbd5e1'} as any)[state??'disabled'];
              const dimmed=employeeMode&&((validBooking&&state!=='available')||(freeRoom&&(f.room_id!==freeRoom||state!=='available')));

              return (
                <g
                  key={f.id}
                  transform={`translate(${f.x},${f.y}) rotate(${f.rotation})`}
                  opacity={employeeMode&&selectedDesk?1:dimmed?0.18:faded?0.25:1}
                  tabIndex={0}
                  role={employeeMode&&!f.workplace_id?undefined:"button"}
                  aria-label={f.code?placeLabel(f.code):(f as any).template_name??'Предмет мебели'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {e.preventDefault();ui.set({ selected: f.id,bookingDesk:employeeMode&&validBooking&&state==='available' });}
                  }}
                  onClick={(e) => { e.stopPropagation(); ui.set({ selected: f.id,bookingDesk:employeeMode&&validBooking&&state==='available' }); }}
                  onPointerDown={(e) => {
                    if (!editing || window.innerWidth < 1024) return;
                    e.stopPropagation();
                    ui.set({ selected: f.id });
                    const p = position(e);
                    dragCheckpoint.current = false;
                    drag.current = { id: f.id, dx: p.x - f.x, dy: p.y - f.y };
                    svgRef.current!.setPointerCapture(e.pointerId);
                  }}
                  style={{ cursor: editing ? 'grab' : 'pointer',pointerEvents:employeeMode&&!f.workplace_id?'none':undefined }}
                >
                  <title>
                    {f.code ?? 'Мебель'} · {f.display_name ?? 'Свободно'}
                    {visual.original ? ' · оригинальный рисунок старой карты' : visual.placeholder ? ' · размер значка условный: нет рисунка и размеров' : ''}
                  </title>
                  <rect
                    data-testid="furniture-hit-area"
                    x={visual.x} y={visual.y} width={visual.width} height={visual.height}
                    rx="5" fill={employeeMode&&!visual.original ? employeeColor : visual.original ? 'transparent' : color}
                    stroke={employeeMode?(selectedDesk?'#2563eb':validBooking&&state==='available'?'#15803d':'none'):ui.selected === f.id ? '#2563eb' : mapMode==='department'?tenantColor(f.department_id??'unassigned'):mapMode==='occupancy'&&f.workplace_id?(f.status==='disabled'?'#9ca3af':f.reserved?'#d99a24':f.employee_id?'#64748b':'#45a773'):validBooking&&f.workplace_id?color:mapMode==='inventory' ? (!f.inventory_number?'#c66e58':f.checked_at?'#478269':'#d58a2a') : visual.original ? 'none' : '#769783'}
                    vectorEffect={employeeMode?"non-scaling-stroke":undefined} strokeWidth={employeeMode?(selectedDesk?3.5:state==='own'?2.5:1.2):validBooking?7:['inventory','department','occupancy'].includes(mapMode)?5:2} strokeDasharray={visual.placeholder ? '4 3' : undefined}
                  />
                  {visual.original && <image style={employeeMode&&f.workplace_id?{filter:validBooking?(state==='available'?'none':'grayscale(1)'):mapMode==='type'&&!validBooking?'grayscale(1) opacity(.4)':state==='available'?'grayscale(1) brightness(1.45) drop-shadow(0 0 1px #64748b)':state==='occupied'?'grayscale(1) brightness(.55)':state==='booked'?'url(#employee-booked-fill)':state==='own'?'url(#employee-own-fill)':'none'}:undefined} opacity={employeeMode&&validBooking&&selectedDesk&&state!=='available'?.22:1} data-testid="furniture-svg"
                    href={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(f.template_svg!)}
                    x={visual.x} y={visual.y} width={visual.width} height={visual.height}
                    preserveAspectRatio="none" pointerEvents="none"/>}
                  {f.workplace_id && (!employeeMode||zoom>=1.7) && (
                    <>
                      <rect
                        x="-12"
                        y={visual.y + visual.height + 3}
                        width="24"
                        height="9"
                        rx="4"
                        fill={color}
                        stroke="#8c9f91"
                      />
                      <text
                        fontSize="11"
                        textAnchor="middle"
                        dy="4"
                        fill={employeeMode&&['occupied','own'].includes(state??'')?'#fff':'#17212e'}
                        pointerEvents="none"
                      >
                        {placeLabel(f.code).replace('Место ','')}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            {furniturePoint&&editing&&<circle cx={furniturePoint.x} cy={furniturePoint.y} r={12} fill="#e9a23b" stroke="#703d00" strokeWidth={3} pointerEvents="none"><title>Центр нового предмета</title></circle>}
            {drawing && (
              <g pointerEvents="none">
                <polygon
                  points={points.map((p) => p.join(',')).join(' ')}
                  fill="#efbc6455"
                  stroke="#bd7824"
                  strokeWidth={3}
                />
                {points.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={5} fill="#bd7824" />
                ))}
              </g>
            )}
            {calibrationPoints.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={8} fill="#ce7500" pointerEvents="none"/>)}
            {calibrationPoints.length===2&&<line x1={calibrationPoints[0][0]} y1={calibrationPoints[0][1]} x2={calibrationPoints[1][0]} y2={calibrationPoints[1][1]} stroke="#ce7500" strokeWidth={3} pointerEvents="none"/>}
          </svg>
          <div className="map-controls">{(!employeeMode||(!selected&&room))&&<button disabled={!ui.selected} onClick={focusSelection}>К выбранному помещению</button>}
            <button aria-label="Уменьшить" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button aria-label="Увеличить" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>
              +
            </button>
            <button
              onClick={() => {
                fitEmployeeFloor();
              }}
            >
              Весь этаж
            </button>
          </div>
          <small className="map-footnote" hidden={employeeMode}>
            {furniture.some((f) => furnitureVisual(f).placeholder)
              ? 'Пунктиром показаны предметы, для которых не удалось восстановить рисунок и размеры. Их значки условные.'
              : 'Перетащите фон для перемещения по плану'}
          </small>
        </section>
        <aside className="inspector">
          {employeeMode?<EmployeeInspector actor={actor} desk={selected} room={room} furniture={furniture} building={allBuildings.data?.find(b=>b.id===l.floor.building_id)?.name??''} floor={l.floor.name} freeRoom={freeRoom} onFreeRoom={setFreeRoom} availability={validBooking?availability.data:undefined}/>:<>
          <div className="inspector-actions"><button onClick={()=>{const screen=selected?(mapMode==='inventory'||!selected.workplace_id?'inventory':'workplaces'):'spaces';ui.set({screen,...(screen==='spaces'?{roomFilters:{building:l.floor.building_id,floor:l.floor.id}}:{}),registryFocus:{screen,id:selected?.id??room?.id??''}});}}>В реестр →</button><button onClick={()=>ui.set({screen:'history',historyQuery:selected?.id??room?.id??''})}>История</button></div>
          {selected ? (
            <>
              <div className="inspector-symbol">
                <Icon name="floor" />
              </div>
              <h2>{selected.workplace_id?employeePlaceLabel(selected.code):(selected as any).template_name??'Мебель'}</h2>
              <span className={'status-pill ' + (selected.employee_id ? 'occupied' : '')}>
                {selected.employee_id ? 'Занято' : selected.reserved ? 'Забронировано' : 'Свободно'}
              </span>
              <dl>
                <dt>Помещение</dt>
                <dd>{room?.name ?? 'Не определено'}</dd>
                <dt>Площадь комнаты</dt>
                <dd>{room?.area_m2 ?? '—'} м²</dd>
                <dt>Расположение</dt><dd>{l.floor.name} этаж · {room?.name??'Помещение не указано'}</dd><dt>Сотрудник</dt>
                <dd>{selected.employee_id===actor.employeeId?'Моё рабочее место':selected.display_name??'Место свободно'}</dd>{selected.employee_id&&<><dt>Должность / подразделение</dt><dd>{[(selected as any).position,selected.department_name].filter(Boolean).join(' · ')||'Не указаны'}</dd></>}
              </dl>
              {actor.role!=='employee'&&mapMode==='inventory'&&<MapInventoryCheck item={selected}/>}
              {selectedWorkplace&&!editing&&<MapBooking key={selected.workplace_id} actor={actor} selected={selected} start={validBooking?bookingStart:''} end={validBooking?bookingEnd:''} status={availability.data?.find(x=>x.workplace_id===selected.workplace_id)?.status}/>}
              {selectedWorkplace && mapMode!=='inventory' && (
                <ControlAssignment key={selected.id} desk={selected}/>
              )}{' '}
              {editing && (
                <div className="desktop-editor coordinate-form">
                  <h3>Положение мебели</h3>
                  {(['x', 'y', 'rotation', 'width', 'depth'] as const).map((k) => (
                    <label key={k}>
                      {k === 'width'
                        ? 'Ширина'
                        : k === 'depth'
                          ? 'Глубина'
                          : k === 'rotation'
                            ? 'Поворот, °'
                            : k.toUpperCase()}
                      <input
                        aria-label={'Мебель ' + k}
                        type="number"
                        step={k === 'rotation' ? 30 : 1}
                        value={selected[k] ?? 0}
                        onChange={(e) =>
                          move(selected.id, {
                            x: selected.x,
                            y: selected.y,
                            rotation: selected.rotation,
                            [k]:
                              k === 'rotation'
                                ? Math.round(Number(e.target.value) / 30) * 30
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                  <p>
                    Координаты центра. Для импортированных объектов требуется сверить точку отсчёта.
                  </p>
                </div>
              )}
            </>
          ) : room ? (
            <>
              <h2>Помещение {room.name}</h2><RoomFacts id={room.id}/>
              {actor.role!=='employee'&&<><button onClick={()=>ui.set({screen:'leases',leaseRooms:[...new Set([...(ui.leaseRooms??[]),room.id])]})}>Создать аренду с этим помещением</button>{mapMode==='lease'&&leaseLayer.data?.filter(x=>x.room_id===room.id).map(x=><div key={x.id}><strong>{x.tenant_name}</strong><p>Договор {x.contract_number} · {String(x.start_date).slice(0,10)} — {String(x.end_date).slice(0,10)}</p><p>{x.area_m2} м² × {x.rate} = {(Number(x.area_m2)*Number(x.rate)).toLocaleString('ru')} {x.currency} / месяц</p><button onClick={()=>ui.set({screen:'leases',leaseId:x.lease_id})}>Открыть договор</button></div>)}</>}
              {mapMode==='quality'&&<div role="status"><p>{room.area_m2==null&&(room as any).calculated_area_m2==null?'Площадь неизвестна: внесите значение по документу ниже или проверьте масштаб этажа.':'Площадь для расчёта известна.'}</p>{room.shape.needsReview&&<p>Контур не распознан как пригодный для расчёта. Проверьте его в редакторе планировки.</p>}<button onClick={()=>ui.set({screen:'editor',selected:room.id})}>Открыть редактор этого помещения</button></div>}
              {mapMode==='cost'&&<><ErrorBox error={mapCosts.error}/><p>{mapCosts.isPending?'Загружаем расчёт…':(()=>{const c=mapCosts.data?.find(c=>c.id===room.id);return c?.total_cost!=null?`${Number(c.total_cost).toLocaleString('ru')} ${c.currency} / ${c.period==='month'?'месяц':'год'}`:c?.area_m2==null?'Для расчёта отсутствует площадь помещения.':'Для расчёта отсутствует действующий тариф.';})()}</p><button onClick={()=>ui.set({screen:'admin'})}>Открыть площади и тарифы</button></>}
              {actor.role!=='employee'&&<><DrawerAction title="Редактировать помещение"><RoomParameters initialRoomId={room.id}/></DrawerAction><RoomAreaHistory room={room}/></>}
              
              <span className="badge">
                {room.shape.needsReview ? 'Геометрия требует проверки' : 'Контур помещения'}
              </span>
            </>
          ) : (
            <div className="inspector-empty">
              <Icon name="floor" />
              <h3>Место для деталей</h3>
              <p>Выберите стол или помещение на карте.</p>
            </div>
          )}
          </>}
        </aside>
      </div>
      {drawing && (
        <section className="desktop-editor">
          <div className="toolbar-actions">
            <button onClick={() => setPoints((p) => p.slice(0, -1))}>
              Убрать последнюю вершину
            </button>
            <button
              onClick={() => {
                setDrawing(false);
                setPoints([]);
              }}
            >
              Отменить контур
            </button>
          </div>
          <RoomDrawForm
            floor={l.floor}
            points={points}
            roomId={drawRoom}
            expectedVersion={drawVersion}
            onDone={() => {
              setDrawing(false);
              setPoints([]);
            }}
          />
        </section>
      )}
      {editing && !drawing && <><EditorTools key={l.floor.id} droppedTemplate={dropTemplate} layout={l} selected={selected} point={furniturePoint} dirty={Object.keys(draft).length>0} onPick={()=>{setFurniturePoint(null);setPickingFurniture(true);svgRef.current?.scrollIntoView({behavior:'smooth',block:'center'});}} /><LayoutVersions key={l.floor.id} layout={l} dirty={Object.keys(draft).length>0}/></>}
      {!employeeMode&&!editing&&!mapView&&<FloorRegistry layout={{...l,furniture}} onSelect={id=>{ui.set({selected:id});setMapView(true);}}/>}

    </>
  );
}
function Assignment({
  actor,
  selected,
  onDone,
}: {
  actor: Actor;
  selected: Furniture;
  onDone: () => void;
}) {
  const [q, setQ] = useState(''),
    [employee, setEmployee] = useState(actor.role==='employee'?actor.employeeId:'');
  const employees = useData<Employee[]>(
    'assign-people',
    '/search?q=' + encodeURIComponent(q),
    actor.role !== 'employee' && q.trim().length>=2,
  );
  const mutation = useMutation({
    mutationFn: async ({ target, employeeId }: { target: string | null; employeeId: string }) => {
      if(!target) {
        const assignmentId=(selected as any).assignment_id;
        if(!assignmentId) throw new Error('Назначение изменилось. Обновите карту.');
        return actor.role==='employee'
          ? api('/me/workplace/release',{expectedAssignmentId:assignmentId})
          : api('/assignments',{employeeId,workplaceId:null,expectedAssignmentId:assignmentId});
      }
      if(actor.role==='employee') {
        const current=await api<any>('/me/workplace');
        if(current && !confirm('У вас уже есть '+placeLabel(current.code)+'. Перенести на '+placeLabel(selected.code)+'?')) return;
        return api('/me/workplace',{workplaceId:target,expectedAssignmentId:current?.assignment_id??null,confirmMove:!!current});
      }
      const history = await api<any[]>('/assignments');
      const previous = history.find((a) => a.employee_id === employeeId && !a.valid_to);
      if (
        target &&
        previous &&
        previous.workplace_id !== target &&
        !confirm('У сотрудника уже есть рабочее место. Перенести?')
      )
        return;
      return api('/assignments', { employeeId, workplaceId: target, expectedAssignmentId:previous?.id??null });
    },
    onSuccess: onDone,
  });
  return (
    <div className="assignment">
      <ErrorBox error={mutation.error} />
      {actor.role !== 'employee' && !selected.employee_id && <SearchSelect label="Сотрудник" value={employee} onChange={setEmployee} onSearch={setQ} minimum={2} loading={employees.isFetching} placeholder="Имя или подразделение" options={(employees.data??[]).map(e=>({id:e.id,label:e.display_name,detail:e.position||undefined}))}/>}
      {selected.reserved ? (
        <p>Сейчас место забронировано.</p>
      ) : !selected.employee_id ? (
        <button
          className="primary full"
          disabled={mutation.isPending || !employee}
          onClick={() => mutation.mutate({ target: selected.workplace_id!, employeeId: employee })}
        >
          {actor.role === 'employee' ? 'Занять это место' : 'Назначить'}
        </button>
      ) : selected.employee_id === actor.employeeId || actor.role !== 'employee' ? (
        <button
          className="full"
          disabled={mutation.isPending}
          onClick={() => { if(confirm(`Снять назначение рабочего места ${selected.code ?? selected.workplace_id} у сотрудника ${selected.display_name ?? 'без имени в источнике'}?`)) mutation.mutate({ employeeId: selected.employee_id!, target: null }); }}
        >
          Снять назначение
        </button>
      ) : (
        <p>Место занято другим сотрудником</p>
      )}
      <small>При назначении предыдущее место сотрудника освобождается.</small>
    </div>
  );
}
function WorkplaceTable({ data, height }: { data: Furniture[]; height: number }) {
  const set = useUI((s) => s.set),
    [sorting, setSorting] = useState<SortingState>([]);
  const cols = useMemo<ColumnDef<Furniture>[]>(
    () => [
      { accessorKey: 'code', header: 'Рабочее место', size: 180, cell:c=>placeLabel(c.getValue()) },
      {
        id: 'state',
        header: 'Статус',
        accessorFn: (r) => (r.employee_id ? 'Занято' : r.reserved ? 'Забронировано' : 'Свободно'),
        size: 160,
        cell: (c) => (
          <span className={'status-pill ' + (c.getValue() === 'Занято' ? 'occupied' : '')}>
            {String(c.getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'display_name',
        header: 'Сотрудник',
        size: 240,
        cell: (c) => String(c.getValue() ?? '—'),
      },
      {
        accessorKey: 'department_name',
        header: 'Подразделение',
        size: 200,
        cell: (c) => String(c.getValue() ?? '—'),
      },
      { accessorKey: 'room_name', header: 'Помещение', size: 170 },
    ],
    [],
  );
  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });
  return (
    <section className="panel">
      <div className="section-heading table-heading">
        <h3>
          Рабочие места <span>{data.length}</span>
        </h3>
        <small>Нажмите заголовок для сортировки · потяните границу столбца</small>
      </div>
      <div className="table-scroll" style={{ height }}>
        <table style={{ width: '100%', minWidth: table.getTotalSize(), tableLayout: 'fixed' }}>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id} style={{ width: `${h.getSize() / table.getTotalSize() * 100}%` }}>
                    <button onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}{' '}
                      {h.column.getIsSorted() === 'asc'
                        ? '↑'
                        : h.column.getIsSorted() === 'desc'
                          ? '↓'
                          : ''}
                    </button>
                    <div
                      className="column-resizer"
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={useUI.getState().selected===row.original.id?'selected-row':''} onClick={() => set({ selected: row.original.id })}>
                {row.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <div className="empty">Рабочие места не найдены</div>}
      </div>
    </section>
  );
}
function People() {
  const [q, setQ] = useState(''),
    [offset, setOffset] = useState(0);
  const highlight=(value:string|undefined)=>{if(!value)return '—';const index=value.toLocaleLowerCase().indexOf(search.toLocaleLowerCase());return !search||index<0?value:<>{value.slice(0,index)}<mark>{value.slice(index,index+search.length)}</mark>{value.slice(index+search.length)}</>;};
  const [search,setSearch]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setSearch(q.trim()),200);return()=>clearTimeout(timer);},[q]);
  const enabled=true;
  const people = useData<Employee[]>(
      'people',
      '/search?q=' + encodeURIComponent(search) + '&offset=' + offset + '&scope=all',
      enabled,
    ),
    set = useUI((s) => s.set);
  return (
    <>
      <div className="search-bar">
        <span>⌕</span>
        <input
          autoFocus
          aria-label="Поиск людей"
          placeholder="Найти сотрудника…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
      </div>
      {!enabled&&<p className="muted">Введите хотя бы две буквы имени, подразделения или должности либо номер рабочего места.</p>}
      <ErrorBox error={people.error} />
      {!enabled ? null : (people.isPending || search!==q.trim()) ? (
        <Loading />
      ) : (
        <DataTable rows={people.data??[]} columns={[
          ['display_name','Сотрудник',e=><span className="directory-name"><span className="directory-avatar">{initials(e.display_name)}</span>{/^Employee \d+$/.test(e.display_name)?'Имя требует уточнения':highlight(e.display_name)}</span>],['position','Должность',e=>highlight(e.position)],['department_name','Подразделение',e=>highlight(e.department_name)],['code','Рабочее место',e=>e.workplace_id?`${e.room_name?'Кабинет '+e.room_name+' · ':''}${employeePlaceLabel(e.code)}`:'Не назначено'],['location','Действие',e=>e.floor_id?<button onClick={async()=>{set({screen:'floor',buildingId:e.building_id,floorId:e.floor_id,selected:null,bookingInterval:undefined});const l=await api<Layout>('/floors/'+e.floor_id+'/layout');set({selected:l.furniture.find(f=>f.workplace_id===e.workplace_id)?.id??null});}}>На карте</button>:'—']
        ]}/>
      )}
      {enabled && people.data?.length === 0 && (
        <div className="empty">По вашему запросу никого не найдено</div>
      )}
      {enabled&&<div className="pagination">
        <button disabled={!offset} onClick={() => setOffset((n) => n - 50)}>
          ← Назад
        </button>
        <span>
          {offset + 1}–{offset + (people.data?.length ?? 0)}
        </span>
        <button disabled={(people.data?.length ?? 0) < 50} onClick={() => setOffset((n) => n + 50)}>
          Далее →
        </button>
      </div>}
    </>
  );
}
function Admin({ buildings }: { buildings: Building[] }) {
  const [filterBuilding,setFilterBuilding]=useState(''),[filterFloor,setFilterFloor]=useState(''),[filterType,setFilterType]=useState(''),[asOf,setAsOf]=useState('');
  const dashboard=useData<any>('dashboard','/dashboard');
  const leased=useData<any[]>('area-leases','/floors/'+encodeURIComponent(filterFloor)+'/leases'+(asOf?'?asOf='+asOf:''),!!filterFloor);
  const costs = useData<any[]>('costs'+asOf, '/costs'+(asOf?'?asOf='+asOf:'')),
    rates = useData<any[]>('cost-rates', '/cost-rates'),
    types = useData<any[]>('space-types', '/space-types'),
    qc = useQueryClient();
  const [message, setMessage] = useState(''),
    [error, setError] = useState<unknown>(null);
  const [scope, setScope] = useState('');
  const roomRows=(dashboard.data?.rooms??[]).filter((r:any)=>(!filterBuilding||r.building_id===filterBuilding)&&(!filterFloor||r.floor_id===filterFloor)&&(!filterType||r.space_type_id===filterType));
  const ids=new Set(roomRows.map((r:any)=>r.id));const costRows=(costs.data??[]).filter(r=>ids.has(r.id));
  return (
    <>
      <div className="registry-toolbar"><label>Здание<select value={filterBuilding} onChange={e=>{setFilterBuilding(e.target.value);setFilterFloor('');}}><option value="">Все здания</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Этаж<select value={filterFloor} onChange={e=>setFilterFloor(e.target.value)}><option value="">Все этажи</option>{[...new Map<string,string>((dashboard.data?.rooms??[]).filter((r:any)=>!filterBuilding||r.building_id===filterBuilding).map((r:any)=>[r.floor_id,r.floor_name])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Тип помещения<select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="">Все типы</option>{types.data?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Расчёт на дату<input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label></div>
      <div className="area-summary"><section>По документам · текущие данные<strong>{roomRows.some((r:any)=>r.official_area_m2!=null)?roomRows.reduce((n:number,r:any)=>n+Number(r.official_area_m2??0),0).toLocaleString('ru',{maximumFractionDigits:1})+' м²':'Нет данных'}</strong><small>{roomRows.filter((r:any)=>r.official_area_m2!=null).length} из {roomRows.length} помещений</small></section><section>По контурам · текущие данные<strong>{roomRows.some((r:any)=>r.calculated_area_m2!=null)?roomRows.reduce((n:number,r:any)=>n+Number(r.calculated_area_m2??0),0).toLocaleString('ru',{maximumFractionDigits:1})+' м²':'Нет расчёта'}</strong><small>{roomRows.filter((r:any)=>r.calculated_area_m2!=null).length} из {roomRows.length} помещений</small></section><section>Стоимость рассчитана<strong>{costRows.filter(r=>r.total_cost!=null).length} из {costRows.length}</strong><small>Валюты и периоды показаны отдельно в таблице.</small></section><section>Площадь в договорах · выбранный этаж<strong>{!filterFloor?'Выберите этаж':leased.isPending?'…':leased.error?'Нет расчёта':leased.data?.length?leased.data.filter(r=>r.kind==='office').reduce((n,r)=>n+Number(r.area_m2),0).toLocaleString('ru',{maximumFractionDigits:1})+' м²':'Нет договоров'}</strong><small>Офисная площадь без распределённых общих зон.</small></section></div><RateHistory />
      {rates.data?.length === 0 && <p className="panel padded" role="status">Тарифы пока не добавлены. Внесите действующие ставки, чтобы рассчитывать стоимость помещений.</p>}
      <ErrorBox error={rates.error} />
      <DrawerAction title="+ Новая ставка">
        <section>
          <span className="eyebrow">ТАРИФЫ</span>
          <h2>Новая ставка</h2>
          <p>Стоимость = площадь помещения × действующий тариф. Валюты и периоды не суммируются.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setError(null);
              try {
                await api('/cost-rates', {
                  space_type_id: d.get('type'),
                  building_id: scope || null,
                  room_id: null,
                  rate_per_m2: Number(d.get('rate')),
                  currency: d.get('currency'),
                  period: d.get('period'),
                  valid_from: d.get('from'),
                  valid_to: d.get('to') || null,
                });
                setMessage('Тариф сохранён');
                qc.invalidateQueries();
              } catch (e) {
                setError(e);
              }
            }}
          >
            <label>
              Тип площади
              <select name="type">
                {types.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Область действия
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Все здания</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                За м²
                <input name="rate" type="number" min="0" step="0.01" required />
              </label>
              <label>
                Валюта
                <select name="currency">
                  <option>RUB</option>
                  <option>EUR</option>
                  <option>USD</option>
                </select>
              </label>
              <label>
                Период
                <select name="period">
                  <option value="month">Месяц</option>
                  <option value="year">Год</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                С даты
                <input name="from" type="date" required />
              </label>
              <label>
                До даты (исключая)
                <input name="to" type="date" />
              </label>
            </div>
            <button className="primary">Сохранить тариф</button>
          </form>
          <ErrorBox error={error} />
          {message && (
            <p role="status" className="green">
              {message}
            </p>
          )}
        </section></DrawerAction>
      <section className="panel">
        <div className="table-heading">
          <h3>Расчёт по помещениям</h3>
        </div>
        <ErrorBox error={costs.error} />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Помещение</th>
                <th>Площадь</th>
                <th>Сотрудников</th>
                <th>м² на человека</th>
                <th>Тариф / м²</th>
                <th>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {costRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}<small style={{display:'block'}}>{r.building_name} · этаж {r.floor_name}</small></td>
                  <td>{r.area_m2 ?? '—'} м²</td>
                  <td>{r.occupants}</td>
                  <td>
                    {r.occupants && r.area_m2 ? (Number(r.area_m2) / r.occupants).toFixed(1) : '—'}
                  </td>
                  <td>{r.rate_per_m2 ?? 'Не задан'}</td>
                  <td>
                    {r.total_cost
                      ? `${Number(r.total_cost).toLocaleString('ru')} ${r.currency} / ${r.period === 'month' ? 'мес.' : 'год'}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Parking({ actor, buildings }: { actor: Actor; buildings: Building[] }) {
  const [buildingFilter, setBuildingFilter] = useState(''),
    [parkingQuery, setParkingQuery] = useState('');
  const spots = useData<any[]>('parking', '/parking'),
    qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: (id: string | null) =>
      api('/parking/assignments', { employeeId: actor.employeeId, parkingSpotId: id }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <RegistryShell>
      <ErrorBox error={spots.error || mutation.error || error} />
      {spots.data?.length === 0 && <section className="empty-workspace" role="status"><h2>Парковочные места ещё не загружены</h2><p>Добавьте места из реестра компании, чтобы назначать их сотрудникам.</p><button onClick={()=>useUI.getState().set({screen:'imports',importKind:'parking'})}>Импортировать</button></section>}
      {!!spots.data?.length&&<><p>Одно активное парковочное место на сотрудника. Новое назначение освобождает предыдущее.</p>
      <div className="form-row">
        <label>
          Здание
          <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
            <option value="">Все здания</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Место, зона или автомобиль
          <input value={parkingQuery} onChange={(e) => setParkingQuery(e.target.value)} />
        </label>
      </div>
      <div className="parking-summary"><strong>Всего: {spots.data?.length??0}</strong><span>Свободно: {spots.data?.filter(p=>!p.employee_id&&!p.reserved&&p.status==='available').length??0}</span><span>Назначено: {spots.data?.filter(p=>p.employee_id).length??0}</span><span>Забронировано: {spots.data?.filter(p=>p.reserved).length??0}</span></div>
      <DataTable rows={(spots.data??[]).filter(p=>(!buildingFilter||p.building_id===buildingFilter)&&[p.number,p.zone,p.vehicle,p.display_name].join(' ').toLowerCase().includes(parkingQuery.toLowerCase()))} columns={[
        ['number','Место'],['building_id','Здание',p=>buildings.find(b=>b.id===p.building_id)?.name],['zone','Зона'],['display_name','Сотрудник'],['vehicle','Автомобиль'],['state','Состояние',p=>p.status!=='available'?'Недоступно':p.employee_id?'Назначено':p.reserved?'Забронировано':'Свободно'],['future_reserved','Предстоящие брони',p=>p.future_reserved?'Есть':'Нет']
      ]}/>
      {actor.role!=='employee'&&<DrawerAction title="Управление парковкой"><ParkingAdmin/></DrawerAction>}</>}
      {actor.role !== 'employee' && (<DrawerAction title="+ Добавить место">
        <form
          className="panel padded inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await api('/parking', {
                building_id: d.get('building'),
                number: d.get('number'),
                area_m2: Number(d.get('area')),
              });
              qc.invalidateQueries();
            } catch (e) {
              setError(e);
            }
          }}
        >
          <h3>Добавить парковочное место</h3>
          <label>
            Здание
            <select name="building">
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Номер
            <input name="number" required />
          </label>
          <label>
            Площадь, м²
            <input name="area" type="number" min="0" step="0.1" required />
          </label>
          <button>Добавить</button>
        </form></DrawerAction>
      )}
    </RegistryShell>
  );
}
const appRoot = import.meta.hot?.data.appRoot ?? createRoot(document.getElementById('root')!);
if(import.meta.hot) import.meta.hot.data.appRoot=appRoot;
appRoot.render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

function MyWorkplace(){
 const current=useData<any>('my-workplace','/me/workplace'),qc=useQueryClient(),set=useUI(s=>s.set);
 const release=useMutation({mutationFn:()=>api('/me/workplace/release',{expectedAssignmentId:current.data.assignment_id}),onSuccess:()=>qc.invalidateQueries()});
 return <section className="my-place-strip"><ErrorBox error={current.error||release.error}/>
 {current.data ? <><p><strong>Моё место · {employeePlaceLabel(current.data.code)}</strong>{current.data.room_name?` · кабинет ${current.data.room_name}`:""}</p>
 <button onClick={()=>set({screen:'floor',buildingId:current.data.building_id,floorId:current.data.floor_id,selected:current.data.furniture_id,bookingInterval:undefined})}>Показать</button>
 </> : <p>Рабочее место не назначено</p>}</section>;
}
