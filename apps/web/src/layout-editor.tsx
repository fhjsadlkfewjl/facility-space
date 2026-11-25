import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Layout, Room, Furniture, Point } from "@office/shared";
import { useFacility } from "./facility";
import { useUI } from "./store";
import { api } from "./api";
import { furnitureVisual } from "./furniture-visual";
import { floorDrawingBounds } from "./floor-fit";
import "./layout-editor.css";
type Item = Furniture & {
  template_id?: string;
  template_name?: string;
  workplaceCode?: string;
};
type Draft = {
  rooms: Room[];
  furniture: Item[];
  sketch: Point[] | null;
  sketchRoom?: string;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function LayoutEditor() {
  const floorId = useUI((s) => s.floorId),
    q = useFacility<Layout>(
      "/floors/" + encodeURIComponent(floorId) + "/layout",
    );
  if (q.error) return <p role="alert">Не удалось открыть план этажа.</p>;
  if (!q.data) return <p>Загрузка планировки…</p>;
  return <Editor key={floorId} source={q.data} />;
}
function Editor({ source }: { source: Layout }) {
  const qc = useQueryClient(),
    types = useFacility<any[]>("/space-types"),
    templates = useFacility<any[]>("/templates");
  const [base, setBase] = useState(source),
    [draft, setDraft] = useState<Draft>(() => ({
      rooms: structuredClone(source.rooms),
      furniture: structuredClone(source.furniture),
      sketch: null,
    }));
  const [past, setPast] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]),
    [selected, setSelected] = useState(""),
    [vertex, setVertex] = useState<number | null>(null);
  const [tool, setTool] = useState<"rooms" | "furniture">("rooms"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [name, setName] = useState(""),
    [type, setType] = useState(""),
    [template, setTemplate] = useState(""),
    [placement, setPlacement] = useState(false),
    [width, setWidth] = useState(""),
    [depth, setDepth] = useState(""),
    [workplaceCode, setWorkplaceCode] = useState("");
  const [showPlan, setShowPlan] = useState(true),
    [cursor, setCursor] = useState<Point | null>(null);
  const bounds = floorDrawingBounds(base);
  const fit = {
    x: bounds.x - 30,
    y: bounds.y - 30,
    w: bounds.width + 60,
    h: bounds.height + 60,
  };
  const [view, setView] = useState(fit);
  const root = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const moving = useRef<{
    before: Draft;
    kind: "vertex" | "furniture" | "pan";
    id: string;
    index?: number;
    start: Point;
    x?: number;
    y?: number;
    view?: typeof view;
  } | null>(null);
  const changed =
      !same(draft.rooms, base.rooms) || !same(draft.furniture, base.furniture),
    dirty = changed || draft.sketch !== null;
  const room = draft.rooms.find((r) => r.id === selected && r.active),
    item = draft.furniture.find((f) => f.id === selected && f.active);
  const commit = (next: Draft) => {
    setPast((v) => [...v.slice(-59), structuredClone(draft)]);
    setFuture([]);
    setDraft(next);
    setError("");
    setMessage("");
  };
  const roomChange = (r: Room) =>
    commit({
      ...draft,
      rooms: draft.rooms.map((x) => (x.id === r.id ? r : x)),
    });
  useEffect(() => {
    useUI.getState().set({ editorDirty: dirty });
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => () => useUI.getState().set({ editorDirty: false }), []);
  useEffect(() => {
    if (
      !dirty &&
      !busy &&
      source.floor.version >= base.floor.version &&
      !same(source, base)
    ) {
      setBase(source);
      setDraft({
        rooms: structuredClone(source.rooms),
        furniture: structuredClone(source.furniture),
        sketch: null,
      });
      setPast([]);
      setFuture([]);
    }
  }, [source, dirty, busy]);
  const undo = () => {
    if (!past.length || busy) return;
    setFuture((v) => [structuredClone(draft), ...v]);
    setDraft(past[past.length - 1]);
    setPast((v) => v.slice(0, -1));
    setVertex(null);
    setError("");
  };
  const redo = () => {
    if (!future.length || busy) return;
    setPast((v) => [...v, structuredClone(draft)]);
    setDraft(future[0]);
    setFuture((v) => v.slice(1));
    setVertex(null);
    setError("");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setPlacement(false);
        setVertex(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const pos = (e: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [
      Math.max(0, Math.min(base.floor.width, Math.round(p.x))),
      Math.max(0, Math.min(base.floor.height, Math.round(p.y))),
    ];
  };
  const choose = (id: string) => {
    setSelected(id);
    setVertex(null);
  };
  function finishSketch() {
    if (!draft.sketch || draft.sketch.length < 3) return;
    if (!name.trim() || !type) {
      setError("Укажите название и тип помещения");
      return;
    }
    const id = draft.sketchRoom ?? crypto.randomUUID();
    if (draft.sketchRoom)
      commit({
        ...draft,
        sketch: null,
        sketchRoom: undefined,
        rooms: draft.rooms.map((r) =>
          r.id === id ? { ...r, shape: { polygon: draft.sketch! } } : r,
        ),
      });
    else
      commit({
        ...draft,
        sketch: null,
        sketchRoom: undefined,
        rooms: [
          ...draft.rooms,
          {
            id,
            floor_id: base.floor.id,
            name: name.trim(),
            space_type_id: type,
            area_m2: null,
            active: true,
            shape: { polygon: draft.sketch },
          },
        ],
      });
    choose(id);
    setName("");
  }
  function removeRoom() {
    if (!room) return;
    const linked = draft.furniture.filter(
      (f) => f.active && f.room_id === room.id,
    );
    if (linked.length) {
      setError(
        `В помещении есть ${linked.length} объектов мебели. Удаление запрещено; можно убрать только контур, сохранив связи.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Удалить помещение «${room.name}»? Оно исчезнет из активных списков после сохранения. История останется. Сервер дополнительно проверит связанные договоры и тарифы.`,
      )
    )
      return;
    if (base.rooms.some((x) => x.id === room.id))
      roomChange({ ...room, active: false });
    else
      commit({ ...draft, rooms: draft.rooms.filter((x) => x.id !== room.id) });
    choose("");
  }
  function clearShape() {
    if (!room) return;
    if (!base.rooms.some((r) => r.id === room.id)) {
      setError(
        "Новое помещение ещё не сохранено. Удалите его или исправьте точки.",
      );
      return;
    }
    if (
      window.confirm(
        `Убрать контур «${room.name}»? Помещение, официальная площадь, мебель и назначения сохранятся. Расчётная площадь по контуру станет неизвестной. Линии исходного SVG останутся на подложке.`,
      )
    )
      roomChange({ ...room, shape: { needsReview: true } });
  }
  function startVertex(e: React.PointerEvent, index: number) {
    if (busy) return;
    e.stopPropagation();
    setVertex(index);
    moving.current = {
      before: structuredClone(draft),
      kind: "vertex",
      id: room!.id,
      index,
      start: pos(e),
    };
    svg.current!.setPointerCapture(e.pointerId);
  }
  function stopMove() {
    const m = moving.current;
    moving.current = null;
    if (m && m.kind !== "pan" && !same(m.before, draft)) {
      setPast((v) => [...v.slice(-59), m.before]);
      setFuture([]);
    }
  }
  async function save() {
    if (draft.sketch) {
      setError("Завершите или отмените рисование перед сохранением");
      return;
    }
    setBusy(true);
    setError("");
    const rooms = draft.rooms.flatMap((r) => {
      const old = base.rooms.find((x) => x.id === r.id);
      if (!old)
        return [
          {
            id: r.id,
            action: "create",
            name: r.name,
            spaceTypeId: r.space_type_id,
            polygon: r.shape.polygon,
          },
        ];
      if (!r.active && old.active) return [{ id: r.id, action: "archive" }];
      if (!same(r.shape, old.shape))
        return [
          {
            id: r.id,
            action: r.shape.polygon ? "shape" : "clear",
            ...(r.shape.polygon ? { polygon: r.shape.polygon } : {}),
          },
        ];
      return [];
    });
    const fields = (f: Item) => ({
      x: f.x,
      y: f.y,
      rotation: f.rotation,
      width: f.width,
      depth: f.depth,
    });
    const changes = draft.furniture
      .filter((f) => {
        const old = base.furniture.find((x) => x.id === f.id);
        return old && !same(fields(f), fields(old));
      })
      .map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y,
        rotation: f.rotation,
        ...(f.width ? { width: f.width } : {}),
        ...(f.depth ? { depth: f.depth } : {}),
      }));
    const additions = draft.furniture
      .filter((f) => !base.furniture.some((x) => x.id === f.id))
      .map((f) => ({
        id: f.id,
        templateId: f.template_id,
        x: f.x,
        y: f.y,
        width: f.width,
        depth: f.depth,
        rotation: f.rotation,
        ...(f.workplaceCode ? { workplaceCode: f.workplaceCode } : {}),
      }));
    try {
      await api(
        "/floors/" + base.floor.id + "/editor",
        {
          expectedVersion: base.floor.version,
          rooms,
          ...(changes.length ? { changes } : {}),
          additions,
        },
        "PUT",
      );
      // Adopt the committed local draft immediately, even if the subsequent refresh is interrupted.
      const next = {
        ...base,
        floor: { ...base.floor, version: base.floor.version + 1 },
        rooms: draft.rooms,
        furniture: draft.furniture,
      };
      setBase(next);
      setPast([]);
      setFuture([]);
      setMessage("Все изменения сохранены одной версией");
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function addAt(p: Point) {
    const t = templates.data?.find((x) => x.id === template);
    if (!t) return;
    const w = Number(width),
      d = Number(depth);
    if (!(w > 0 && d > 0)) {
      setError("Укажите ширину и глубину предмета");
      return;
    }
    const id = crypto.randomUUID();
    commit({
      ...draft,
      furniture: [
        ...draft.furniture,
        {
          id,
          template_id: t.id,
          template_name: t.name,
          template_svg: t.svg,
          template_geometry: t.api_geometry_evidence,
          floor_id: base.floor.id,
          room_id: null,
          x: p[0],
          y: p[1],
          rotation: 0,
          width: w,
          depth: d,
          geometry_verified: true,
          active: true,
          ...(workplaceCode.trim()
            ? { workplaceCode: workplaceCode.trim() }
            : {}),
        },
      ],
    });
    choose(id);
    setPlacement(false);
  }
  return (
    <div className="layout-draft-editor" ref={root}>
      <div className="editor-commandbar">
        <button
          disabled={busy || draft.sketch !== null}
          onClick={() => {
            setTool("rooms");
            choose("");
            commit({ ...draft, sketch: [], sketchRoom: undefined });
            setName("");
            setType(types.data?.[0]?.id ?? "");
          }}
        >
          Нарисовать помещение
        </button>
        <button disabled={busy || !past.length} onClick={undo}>
          Назад
        </button>
        <button disabled={busy || !future.length} onClick={redo}>
          Вперёд
        </button>
        <button
          disabled={busy || !dirty}
          onClick={() => {
            if (window.confirm("Отменить все несохранённые изменения?")) {
              setDraft({
                rooms: structuredClone(base.rooms),
                furniture: structuredClone(base.furniture),
                sketch: null,
              });
              setPast([]);
              setFuture([]);
              setError("");
            }
          }}
        >
          Отменить всё
        </button>
        <button
          className="primary"
          disabled={busy || !changed || draft.sketch !== null}
          onClick={save}
        >
          {busy ? "Сохраняем…" : "Сохранить изменения"}
        </button>
        <span role="status">
          {dirty ? "Есть несохранённые изменения" : "Изменений нет"}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {source.floor.version !== base.floor.version && dirty && (
        <p role="alert">
          На сервере появилась другая версия. Черновик не потерян. Сохранение
          будет отклонено; сначала отмените черновик и загрузите актуальный
          план.
        </p>
      )}
      <div
        className="draft-editor-body"
        aria-busy={busy}
        style={busy ? { pointerEvents: "none", opacity: 0.6 } : undefined}
      >
        <aside className="draft-objects">
          <h3>Объекты этажа</h3>
          <div className="segmented">
            <button
              aria-pressed={tool === "rooms"}
              onClick={() => setTool("rooms")}
            >
              Помещения
            </button>
            <button
              aria-pressed={tool === "furniture"}
              onClick={() => setTool("furniture")}
            >
              Мебель
            </button>
          </div>
          <div className="draft-object-list">
            {tool === "rooms"
              ? draft.rooms
                  .filter((r) => r.active)
                  .map((r) => (
                    <button
                      key={r.id}
                      aria-pressed={selected === r.id}
                      onClick={() => choose(r.id)}
                    >
                      {r.name}
                      {!r.shape.polygon && !r.shape.path
                        ? " · без контура"
                        : ""}
                    </button>
                  ))
              : draft.furniture
                  .filter((f) => f.active)
                  .map((f) => (
                    <button
                      key={f.id}
                      aria-pressed={selected === f.id}
                      onClick={() => choose(f.id)}
                    >
                      {f.code ?? f.template_name ?? "Мебель"}
                    </button>
                  ))}
          </div>
          {tool === "furniture" && (
            <details>
              <summary>Добавить мебель</summary>
              <label>
                Шаблон
                <select
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    const t = templates.data?.find(
                      (x) => x.id === e.target.value,
                    );
                    setWidth(
                      String(
                        t?.real_width_m && base.floor.meters_per_unit
                          ? t.real_width_m / base.floor.meters_per_unit
                          : (t?.width ?? ""),
                      ),
                    );
                    setDepth(
                      String(
                        t?.real_depth_m && base.floor.meters_per_unit
                          ? t.real_depth_m / base.floor.meters_per_unit
                          : (t?.depth ?? ""),
                      ),
                    );
                    setWorkplaceCode("");
                  }}
                >
                  <option value="">Выберите</option>
                  {templates.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ширина, ед. плана
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label>
                Глубина, ед. плана
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                />
              </label>
              {templates.data?.find((t) => t.id === template)?.is_workplace && (
                <label>
                  Номер места (необязательно)
                  <input
                    value={workplaceCode}
                    onChange={(e) => setWorkplaceCode(e.target.value)}
                  />
                </label>
              )}
              <button
                disabled={!template || busy || draft.sketch !== null}
                onClick={() => setPlacement(true)}
              >
                Указать место на плане
              </button>
            </details>
          )}
        </aside>
        <section className="draft-canvas">
          <div className="editor-commandbar">
            <button
              onClick={() =>
                setView((v) => ({ ...v, w: v.w / 1.25, h: v.h / 1.25 }))
              }
            >
              ＋
            </button>
            <button
              onClick={() =>
                setView((v) => ({ ...v, w: v.w * 1.25, h: v.h * 1.25 }))
              }
            >
              −
            </button>
            <button onClick={() => setView(fit)}>Весь этаж</button>
            {room?.shape.polygon && (
              <button
                onClick={() => {
                  const p = room.shape.polygon!,
                    xs = p.map((v) => v[0]),
                    ys = p.map((v) => v[1]),
                    x = Math.min(...xs),
                    y = Math.min(...ys),
                    w = Math.max(...xs) - x,
                    h = Math.max(...ys) - y,
                    pad = Math.max(w, h) * 0.2 + 10;
                  setView({
                    x: x - pad,
                    y: y - pad,
                    w: w + 2 * pad,
                    h: h + 2 * pad,
                  });
                }}
              >
                К выбранному помещению
              </button>
            )}
            <label>
              <input
                type="checkbox"
                checked={showPlan}
                onChange={(e) => setShowPlan(e.target.checked)}
              />
              Исходный план
            </label>
          </div>
          <p>
            {draft.sketch
              ? "Нажимайте по углам по порядку. Завершите контур кнопкой справа."
              : placement
                ? "Нажмите в точке центра нового предмета."
                : tool === "rooms"
                  ? "Выберите комнату. Точки перетаскиваются; кнопки + на рёбрах добавляют вершины."
                  : "Перетаскивайте мебель; изменения пока только в черновике."}
          </p>
          <svg
            ref={svg}
            aria-label="Редактор этажа"
            role="img"
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            onClick={(e) => {
              if (busy) return;
              if (draft.sketch !== null) {
                commit({ ...draft, sketch: [...draft.sketch, pos(e)] });
                return;
              }
              if (placement) {
                addAt(pos(e));
                return;
              }
            }}
            onPointerDown={(e) => {
              if (
                e.target !== e.currentTarget ||
                draft.sketch !== null ||
                placement
              )
                return;
              moving.current = {
                kind: "pan",
                before: draft,
                id: "",
                start: pos(e),
                view,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (draft.sketch !== null) setCursor(pos(e));
              const m = moving.current;
              if (!m || busy) return;
              const p = pos(e);
              if (m.kind === "pan") {
                setView({
                  ...m.view!,
                  x: m.view!.x + m.start[0] - p[0],
                  y: m.view!.y + m.start[1] - p[1],
                });
                return;
              }
              if (m.kind === "vertex")
                setDraft((v) => ({
                  ...v,
                  rooms: v.rooms.map((r) =>
                    r.id === m.id
                      ? {
                          ...r,
                          shape: {
                            polygon: r.shape.polygon!.map((x, i) =>
                              i === m.index ? p : x,
                            ),
                          },
                        }
                      : r,
                  ),
                }));
              else
                setDraft((v) => ({
                  ...v,
                  furniture: v.furniture.map((f) =>
                    f.id === m.id
                      ? {
                          ...f,
                          x: Math.round(m.x! + p[0] - m.start[0]),
                          y: Math.round(m.y! + p[1] - m.start[1]),
                        }
                      : f,
                  ),
                }));
            }}
            onPointerUp={stopMove}
            onPointerCancel={() => {
              if (moving.current) setDraft(moving.current.before);
              moving.current = null;
            }}
          >
            {showPlan && base.floor.background_svg && (
              <image
                href={
                  "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(base.floor.background_svg)
                }
                width={base.floor.width}
                height={base.floor.height}
                pointerEvents="none"
              />
            )}
            {draft.rooms
              .filter((r) => r.active)
              .map((r) => (
                <g
                  key={r.id}
                  data-room-id={r.id}
                  role="button"
                  aria-label={"Помещение " + r.name}
                  onClick={(e) => {
                    if (draft.sketch !== null || placement) return;
                    e.stopPropagation();
                    choose(r.id);
                  }}
                  style={{ pointerEvents: tool === "rooms" ? "auto" : "none" }}
                >
                  {r.shape.polygon ? (
                    <polygon
                      points={r.shape.polygon.map((p) => p.join(",")).join(" ")}
                      fill={selected === r.id ? "#f5c56e" : "#9cc9b2"}
                      fillOpacity=".22"
                      stroke={selected === r.id ? "#ad6300" : "#326d54"}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : r.shape.path ? (
                    <path
                      d={r.shape.path}
                      fill="#9cc9b2"
                      fillOpacity=".2"
                      stroke="#326d54"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              ))}
            {draft.furniture
              .filter((f) => f.active)
              .map((f) => {
                const v = furnitureVisual(f);
                return (
                  <g
                    key={f.id}
                    transform={`translate(${f.x} ${f.y}) rotate(${f.rotation})`}
                    data-furniture-id={f.id}
                    style={{
                      pointerEvents:
                        tool === "furniture" && draft.sketch === null
                          ? "auto"
                          : "none",
                      cursor: "grab",
                    }}
                    onClick={(e) => {
                      if (placement) return;
                      e.stopPropagation();
                      choose(f.id);
                    }}
                    onPointerDown={(e) => {
                      if (busy || placement) return;
                      e.stopPropagation();
                      choose(f.id);
                      moving.current = {
                        kind: "furniture",
                        before: structuredClone(draft),
                        id: f.id,
                        start: pos(e),
                        x: f.x,
                        y: f.y,
                      };
                      svg.current!.setPointerCapture(e.pointerId);
                    }}
                  >
                    <rect
                      x={v.x}
                      y={v.y}
                      width={v.width}
                      height={v.height}
                      fill={selected === f.id ? "#f5c56e" : "#d6e6dd"}
                      stroke={selected === f.id ? "#ad6300" : "#326d54"}
                      vectorEffect="non-scaling-stroke"
                    />
                    {v.original && f.template_svg && (
                      <image
                        href={
                          "data:image/svg+xml;charset=utf-8," +
                          encodeURIComponent(f.template_svg)
                        }
                        x={v.x}
                        y={v.y}
                        width={v.width}
                        height={v.height}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            {draft.sketch !== null && (
              <polyline
                points={[...draft.sketch, ...(cursor ? [cursor] : [])]
                  .map((p) => p.join(","))
                  .join(" ")}
                fill="none"
                stroke="#bb6700"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {draft.sketch?.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={view.w / 180}
                fill="#bb6700"
                pointerEvents="none"
              />
            ))}
            {room?.shape.polygon &&
              tool === "rooms" &&
              draft.sketch === null &&
              !placement &&
              room.shape.polygon.map((p, i) => {
                const next =
                  room.shape.polygon![(i + 1) % room.shape.polygon!.length];
                return (
                  <g key={i}>
                    <circle
                      aria-label={"Точка " + (i + 1)}
                      data-vertex={i}
                      cx={p[0]}
                      cy={p[1]}
                      r={view.w / 150}
                      fill={vertex === i ? "#bb6700" : "white"}
                      stroke="#ad6300"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(e) => startVertex(e, i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVertex(i);
                      }}
                    />
                    <g
                      role="button"
                      aria-label={"Добавить точку после " + (i + 1)}
                      onClick={(e) => {
                        e.stopPropagation();
                        const points = [...room.shape.polygon!];
                        points.splice(i + 1, 0, [
                          (p[0] + next[0]) / 2,
                          (p[1] + next[1]) / 2,
                        ]);
                        roomChange({ ...room, shape: { polygon: points } });
                        setVertex(i + 1);
                      }}
                    >
                      <circle
                        cx={(p[0] + next[0]) / 2}
                        cy={(p[1] + next[1]) / 2}
                        r={view.w / 220}
                        fill="white"
                        stroke="#326d54"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={(p[0] + next[0]) / 2}
                        y={(p[1] + next[1]) / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={view.w / 160}
                        pointerEvents="none"
                      >
                        +
                      </text>
                    </g>
                  </g>
                );
              })}
          </svg>
        </section>
        <aside className="draft-inspector">
          {draft.sketch !== null ? (
            <>
              <h3>
                {draft.sketchRoom
                  ? "Новый контур помещения"
                  : "Новое помещение"}
              </h3>
              <label>
                Название помещения
                <input
                  disabled={!!draft.sketchRoom}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Тип помещения
                <select
                  disabled={!!draft.sketchRoom}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {types.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>Точек: {draft.sketch.length}</p>
              <button
                disabled={draft.sketch.length < 3 || busy}
                onClick={finishSketch}
              >
                Завершить контур
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  commit({ ...draft, sketch: null, sketchRoom: undefined })
                }
              >
                Отменить рисование
              </button>
            </>
          ) : room ? (
            <>
              <h3>Помещение {room.name}</h3>
              <p>
                {types.data?.find((t) => t.id === room.space_type_id)?.name ??
                  "Тип не указан"}
              </p>
              <p>Площадь по документам: {room.area_m2 ?? "не указана"}</p>
              {room.shape.polygon ? (
                <>
                  <p>Перетащите точку или выберите её для удаления.</p>
                  <button
                    disabled={
                      vertex === null || room.shape.polygon.length <= 3 || busy
                    }
                    onClick={() => {
                      roomChange({
                        ...room,
                        shape: {
                          polygon: room.shape.polygon!.filter(
                            (_, i) => i !== vertex,
                          ),
                        },
                      });
                      setVertex(null);
                    }}
                  >
                    Удалить выбранную точку
                  </button>
                </>
              ) : (
                <p>
                  Нет редактируемых точек. Нарисуйте новый контур вместо
                  исходного пути.
                </p>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  setName(room.name);
                  setType(room.space_type_id ?? types.data?.[0]?.id ?? "");
                  commit({ ...draft, sketch: [], sketchRoom: room.id });
                }}
              >
                Перерисовать контур
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Заменить контур прямоугольником в пределах текущей области? Затем можно передвинуть точки.",
                    )
                  ) {
                    const p = room.shape.polygon;
                    const x = p
                        ? Math.min(...p.map((v) => v[0]))
                        : Math.max(0, view.x),
                      y = p
                        ? Math.min(...p.map((v) => v[1]))
                        : Math.max(0, view.y),
                      w = p
                        ? Math.max(...p.map((v) => v[0])) - x
                        : Math.min(view.w / 4, base.floor.width - x),
                      h = p
                        ? Math.max(...p.map((v) => v[1])) - y
                        : Math.min(view.h / 4, base.floor.height - y);
                    roomChange({
                      ...room,
                      shape: {
                        polygon: [
                          [x, y],
                          [x + w, y],
                          [x + w, y + h],
                          [x, y + h],
                        ],
                      },
                    });
                  }
                }}
              >
                Задать прямоугольный контур
              </button>
              <button
                disabled={busy || (!room.shape.polygon && !room.shape.path)}
                onClick={clearShape}
              >
                Убрать только контур
              </button>
              <button disabled={busy} onClick={removeRoom}>
                Удалить помещение
              </button>
              <small>
                Удаление и правки применятся только по кнопке «Сохранить
                изменения». Линии исходного плана не стираются.
              </small>
            </>
          ) : item ? (
            <>
              <h3>{item.code ?? item.template_name ?? "Мебель"}</h3>
              <p>
                {item.display_name ?? "Без назначения"} — назначения редактор не
                меняет.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  commit({
                    ...draft,
                    furniture: draft.furniture.map((f) =>
                      f.id === item.id
                        ? { ...f, rotation: (f.rotation + 30) % 360 }
                        : f,
                    ),
                  })
                }
              >
                Повернуть на 30°
              </button>
              {!base.furniture.some((f) => f.id === item.id) && (
                <button
                  onClick={() => {
                    commit({
                      ...draft,
                      furniture: draft.furniture.filter(
                        (f) => f.id !== item.id,
                      ),
                    });
                    choose("");
                  }}
                >
                  Убрать новый предмет
                </button>
              )}
            </>
          ) : (
            <p>Выберите помещение или мебель на плане либо в списке слева.</p>
          )}
          <hr />
          <p>
            Черновик хранится на экране до сохранения. «Назад / Вперёд» работает
            для контуров, удаления и мебели.
          </p>
        </aside>
      </div>
    </div>
  );
}
