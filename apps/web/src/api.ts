import { useUI } from './store';
export const demo = !!import.meta.env.VITE_DEMO_TOKEN;
export async function api<T = any>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const s = useUI.getState();
  const token = demo ? `${import.meta.env.VITE_DEMO_TOKEN}:${s.demoRole}` : s.token;
  const r = await fetch('/api' + path, {
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { method, body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) {
    const translations: Record<string, string> = {
      'Furniture must fit exactly one validated room (or specify a containing room)': 'Предмет должен целиком помещаться внутри одного помещения с проверенным контуром. Проверьте координаты центра и размеры.',
      'Floor has furniture with unknown dimensions; reconcile before editing': 'На этаже есть мебель с неизвестными размерами. Пока они не уточнены, система не может проверить пересечения и добавить предмет.',
      'Template not found': 'Шаблон мебели не найден. Обновите список шаблонов.',
      'Booking overlaps an existing reservation': 'На это время место уже забронировано.',
      'Employee already has a booking of this kind':
        'У сотрудника уже есть бронь этого типа на выбранное время.',
      'Resource has a permanent assignment': 'Место постоянно закреплено за сотрудником.',
      'Resource has active or future bookings':
        'Нельзя занять постоянно: для места появились текущие или будущие бронирования. Выберите другое место или время.',
      'Building is outside your responsibility':
        'Это здание не входит в вашу зону ответственности.',
      'Target already occupied': 'Место уже занято другим сотрудником.',
      'Layout changed. Reload before saving.':
        'План изменён другим пользователем. Обновите страницу перед сохранением.',
      'Layout changed. Reload.': 'План изменён. Обновите страницу перед сохранением.',
      'Global rates require admin':
        'Общий тариф может задавать только администратор. Выберите здание.',
      'Overlapping rate for this scope': 'Для этого периода уже задан тариф.',
      'Booking cannot start in the past': 'Нельзя создать бронь в прошлом.',
      'Concurrent conflict; reload and retry':
        'Данные изменились или значение уже используется. Обновите страницу.',
    };
    throw new Error(translations[data.error] ?? (typeof data.error==='string' && data.error.startsWith('Furniture collision:') ? 'Предмет пересекается с другой мебелью. Измените положение или размеры.' : data.error) ?? 'Не удалось выполнить запрос');
  }
  // Local presentation exclusion: one confirmed test record, never a name heuristic.
  if(path==='/buildings'&&s.demoRole==='employee'&&Array.isArray(data))
    return data.filter(b=>b.active!==false&&b.id!=='3fcaf7f4-c31d-4b07-a937-4130f0ed9281') as T;
  return data;
}
