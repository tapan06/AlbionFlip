'use strict';
// ---------- настройки автора ----------
const AUTHOR_URL = 'https://www.youtube.com/@MemoryShardsDev';
const DONATE_URL = '';   // впиши сюда ссылку для доната (Boosty, Ko-fi и т.п.) — в окне «Поддержать» появится кнопка

const CATS = [[0,'Оружие'],[1,'Левая рука'],[2,'Броня'],[3,'Плащи'],[4,'Сумки'],[5,'Маунты'],[6,'Артефакты'],[7,'Ресурсы'],[9,'Прочее']];
const BM = 'Black Market';
const CITIES = [['Caerleon','Карлеон'],['Bridgewatch','Бриджвотч'],['Fort Sterling','Форт-Стерлинг'],['Lymhurst','Лимхерст'],['Martlock','Мартлок'],['Thetford','Тетфорд'],['Brecilien','Брецилиен']];
const CITY_RU = Object.fromEntries([...CITIES, [BM,'Чёрный рынок']]);
const QUALS = [[1,'Обычное'],[2,'Хорошее'],[3,'Выдающееся'],[4,'Отличное'],[5,'Шедевр']];
const QUAL_RU = Object.fromEntries(QUALS);
const SERVERS = [['europe','Европа'],['west','Америка'],['east','Азия']];
const COLS = [
  ['name','Предмет','',''], ['tier','Тир','',''],
  ['b','Купить','','Где и как покупать: «Сразу» — по цене продавца, «Заказ» — свой заказ на покупку'], ['bp','Цена','n','Цена покупки за штуку'],
  ['s','Продать','','Где и как продавать'], ['sp','Цена','n','Цена продажи за штуку'],
  ['profit','Прибыль','n','Прибыль с одной штуки после налога и сбора'], ['pct','%','n','Прибыль в процентах от затрат'],
  ['w','Вес','n','Вес одной штуки, кг'],
  ['take','Шт','n','Сколько штук реально взять: ограничено свободным весом, серебром и спросом за день. Учитывает то, что уже лежит в корзине.'],
  ['trip','За рейс','n','Прибыль за рейс при таком количестве'],
  ['vol','Спрос/день','n','Сколько штук в среднем продаётся за день там, где продаёшь'],
  ['dev','К средней','n','Насколько цена продажи выше или ниже средней за 7 дней. Большой плюс — скорее всего случайный заказ, а не реальная цена.'],
  ['age','Данные','n','Возраст самой старой из двух цен']
];
const SLOTS = [['bag','Сумка'],['head','Шлем'],['cape','Плащ'],['main','Оружие'],['armor','Броня'],['off','Левая рука'],['potion','Зелье'],['shoes','Обувь'],['food','Еда'],[null],['mount','Маунт'],[null]];
const SLOT_RU = Object.fromEntries(SLOTS.filter(s => s[0]));
const WEAR = ['head','cape','main','armor','off','shoes'];   // весят и имеют качество
const CONS = ['potion','food'];
const MAX_ROWS = 300;
const BASE_LOAD = 50;   // грузоподъёмность персонажа без сумки и маунта (данные игры)
const BASE_TITLE = document.title;
const $ = id => document.getElementById(id);
const ITEMS = window.AO_ITEMS || [], MOUNTS = window.AO_MOUNTS || [], BAGS = window.AO_BAGS || {};
const RECIPES = window.AO_RECIPES || {}, UPG = window.AO_UPGRADES || {}, XNAMES = window.AO_NAMES || {};
const NAME = new Map(ITEMS.map(i => [i[0], i[1]]));
const WEIGHT = new Map(ITEMS.map(i => [i[0], i[3] || 0]));
const nameOf = id => NAME.get(id) || XNAMES[id] || id;
const safeId = id => /^[A-Z0-9_@]+$/i.test(String(id || '')) ? String(id) : '';
const IMG = (id, extra) => `https://render.albiononline.com/v1/item/${safeId(id) || 'T1_TRASH'}.png?size=64${String(extra || '').replace(/[^a-z0-9=&_-]/gi, '')}`;

let raw = new Map();      // "id|quality" -> {id, q, c:{city: priceRow}}
let resP = new Map();     // цены материалов зачарования: тот же формат, качество 1
let rows = [], view = [], enchRows = [], craftRows = [];
const vol = new Map();    // "id|quality|city" -> продаж в день
const avgp = new Map();   // "id|quality|city" -> средняя цена за 7 дней
let scanned = new Set();  // города, по которым загружены цены
let sortKey = 'pct', sortDir = -1, stop = false, busy = false, newCount = 0, tab = 'home';
let cargo = { mount: '', bagT: 0, bagE: 0, gear: {}, qual: {}, slot: '', gTier: 4, gEnch: 0 };
let cart = [];            // корзина: снимки сделок с количеством
let hidden = new Set();   // скрытые предметы (id)
let gearQ = '', panelOpts = [];

// ---------- мелочи ----------
function mkChecks(id, name, opts, defaults) {
  $(id).innerHTML = opts.map(([v, t]) =>
    `<label data-v="${v}" class="${defaults.includes(v) ? 'on' : ''}"><input type="checkbox" name="${name}" value="${v}"${defaults.includes(v) ? ' checked' : ''}>${t}</label>`).join('');
}
function checked(name) { return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value); }
function setChecked(name, values) { document.querySelectorAll(`input[name="${name}"]`).forEach(i => i.checked = values.includes(i.value)); }
function num(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : 0; }
function esc(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }
function kg(n) { return (Math.round(n * 10) / 10).toLocaleString('ru-RU'); }
function setStatus(t) { $('status').textContent = t; if ($('craftStatus')) $('craftStatus').textContent = t; }
function shortName(n) { return n.replace(/\s*\([^)]*\)\s*$/, ''); }
function tierOf(id) { const at = id.indexOf('@'); return id[1] + '.' + (at < 0 ? '0' : id.slice(at + 1)); }
function enchOf(id) { const at = id.indexOf('@'); return at < 0 ? 0 : +id.slice(at + 1); }
const CITY_CLS = { 'Caerleon': 'c-caer', 'Bridgewatch': 'c-bw', 'Fort Sterling': 'c-fs', 'Lymhurst': 'c-lym', 'Martlock': 'c-mart', 'Thetford': 'c-thet', 'Brecilien': 'c-brec', [BM]: 'c-bm' };
function tierPill(ts) { const [t, e] = esc(String(ts)).split('.'); return `<span class="tbadge t-${t} e-${e || 0}">${esc(ts)}</span>`; }
function cityTag(city, how) { const h = how === 'Заказ' ? 'Заказ' : 'Сразу'; return `<span class="city ${CITY_CLS[city] || ''}">${esc(CITY_RU[city] || city)}</span> <span class="tag${h === 'Заказ' ? ' o' : ''}">${h}</span>`; }
function itemCell(id, q, sub) { const qn = Math.max(1, Math.min(5, parseInt(q, 10) || 1)); return `<td class="item q-${qn}"><img class="ico" loading="lazy" src="${IMG(id, '&quality=' + qn)}" alt=""><span><b>${esc(nameOf(id))}</b><i>${esc(sub)}</i></span></td>`; }
function copyText(text, msg) {
  const done = () => setStatus(msg);
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { setStatus('Не получилось скопировать — браузер запретил доступ к буферу.'); } ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

$('server').innerHTML = SERVERS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('craftCity').innerHTML = '<option value="*">Где дешевле (все города)</option>' + CITIES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
mkChecks('tiers', 'tier', [4,5,6,7,8].map(t => [t, 'T' + t]), [4,5,6,7,8]);
mkChecks('enchs', 'ench', [0,1,2,3,4].map(e => [e, '.' + e]), [0,1,2,3,4]);
mkChecks('quals', 'qual', QUALS, [1,2,3]);
mkChecks('cats', 'cat', CATS, [0,1,2,3,4]);
mkChecks('buyCities', 'buy', CITIES, ['Caerleon']);
mkChecks('sellCities', 'sell', [[BM,'Чёрный рынок'], ...CITIES], [BM]);
$('head').innerHTML = '<th></th>' + COLS.map(([k, t, c, tip]) => `<th data-k="${k}" class="${c}"${tip ? ` title="${tip}"` : ''}>${t}</th>`).join('');
$('authorLink').href = AUTHOR_URL; $('ytLink').href = AUTHOR_URL;
if (DONATE_URL) { $('donateLink').href = DONATE_URL; $('donateLink').hidden = false; }

function syncChecks() { document.querySelectorAll('.checks input').forEach(i => i.parentElement.classList.toggle('on', i.checked)); }

// настройки, корзина и скрытые предметы запоминаются в браузере
function saveCfg() {
  const o = { cargo, cart, hidden: [...hidden], tab, open: {} };
  document.querySelectorAll('select, input[type=number], input[type=text]').forEach(e => { if (e.id && e.id !== 'gearQ') o[e.id] = e.value; });
  document.querySelectorAll('input[type=checkbox]').forEach(e => o[e.id || e.name + ':' + e.value] = e.checked);
  document.querySelectorAll('details').forEach(d => o.open[d.id] = d.open);
  try { localStorage.setItem('albionflip4', JSON.stringify(o)); } catch (e) {}
}
function loadCfg() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem('albionflip4')); } catch (e) {}
  if (!o) return;
  document.querySelectorAll('select, input[type=number], input[type=text]').forEach(e => { if (e.id && o[e.id] != null) e.value = o[e.id]; });
  document.querySelectorAll('input[type=checkbox]').forEach(e => { const k = e.id || e.name + ':' + e.value; if (o[k] != null) e.checked = o[k]; });
  if (o.cargo) cargo = Object.assign(cargo, o.cargo, { slot: '' });
  if (!cargo.gear) cargo.gear = {};
  if (!cargo.qual) cargo.qual = {};
  if (Array.isArray(o.cart)) cart = o.cart;
  if (Array.isArray(o.hidden)) hidden = new Set(o.hidden);
  if (o.tab) tab = o.tab;
  if (o.open) document.querySelectorAll('details').forEach(d => { if (o.open[d.id] != null) d.open = o.open[d.id]; });
  $('autoOn').checked = false;   // авто-обновление каждый раз включается вручную
}
loadCfg(); syncChecks();

function cfg() {
  return {
    server: $('server').value, buyMode: $('buyMode').value, sellMode: $('sellMode').value, sameCity: $('sameCity').checked,
    tiers: checked('tier'), enchs: checked('ench'), quals: checked('qual'), cats: checked('cat').map(Number),
    buy: checked('buy'), sell: checked('sell'),
    minPct: num('minPct'), maxPct: num('maxPct') || Infinity,
    maxAge: num('maxAge') || Infinity, tax: num('tax') / 100, setup: num('setup') / 100,
    search: $('search').value.trim().toLowerCase()
  };
}

// ---------- вкладки и главная ----------
function showTab(t) {
  tab = t;
  $('homeView').hidden = t !== 'home'; $('mapView').hidden = t !== 'map'; $('app').hidden = t === 'home' || t === 'map';
  $('app').dataset.tab = t;
  if ($('actionBar')) $('actionBar').hidden = t !== 'deals' && t !== 'ench';
  if (t === 'cart') $('secCargo').open = true;
  for (const v of ['deals', 'ench', 'craft', 'cart']) $(v + 'View').hidden = t !== v;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  saveCfg();
}
$('tabs').onclick = e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.t); };
$('logo').onclick = () => showTab('home');
$('homeView').onclick = e => { const g = e.target.closest('[data-go]'); if (g) showTab(g.dataset.go); };
$('supportBtn').onclick = () => $('supportDlg').showModal();
$('supportClose').onclick = () => $('supportDlg').close();
// парящие предметы на главной: [предмет, x%, y%, размер, секунд на цикл, задержка, наклон]
$('hero').insertAdjacentHTML('afterbegin', [
  ['T8_BAG@3', 8, 14, 104, 7, 0, -6], ['T8_2H_BOW@2', 84, 12, 112, 8, -2, 7], ['T7_MEAL_PIE', 20, 62, 84, 6, -1, 5],
  ['T8_MOUNT_OX', 76, 60, 120, 9, -3, -4], ['T6_HEAD_PLATE_SET1@1', 30, 8, 76, 7.5, -4, 8], ['T8_CAPE@2', 64, 6, 80, 6.5, -2.5, -8],
  ['T7_ARMOR_LEATHER_SET2@3', 4, 44, 92, 8.5, -5, 4], ['T8_MAIN_SWORD@1', 90, 40, 96, 7, -1.5, -5], ['T6_RUNE', 38, 84, 64, 6, -3.5, 10],
  ['T7_POTION_REVIVE', 60, 85, 66, 7, -0.5, -9]
].map(([id, x, y, s, d, dl, r]) => `<img class="float" alt="" src="https://render.albiononline.com/v1/item/${id}.png?size=128" style="--x:${x}%;--y:${y}%;--s:${s}px;--d:${d}s;--dl:${dl}s;--r:${r}deg">`).join(''));

// ---------- снаряжение и груз ----------
// Формула из данных игры: множитель предмета × 25 × 1.0918^(2.2641 × сила предмета / 100)
function bagKg(t, e) { return 25 * Math.pow(1.0918, 2.264101591 * (t + 3 + e)); }
function tag(t, e) { return 'T' + t + (e ? '.' + e : ''); }
function bagEnch() { return cargo.bagT < 4 ? 0 : cargo.bagE; }
function bagId() { return cargo.bagT ? `T${cargo.bagT}_BAG` + (bagEnch() ? '@' + bagEnch() : '') : ''; }
function pieOf(id) {   // пирог даёт +10/20/30% груза (T3/T5/T7) и ещё +5% за каждое зачарование
  const m = /^T(\d)_MEAL_PIE(?:@(\d))?$/.exec(id || ''); if (!m) return 0;
  const base = ({ 3: 10, 5: 20, 7: 30 })[m[1]]; return base ? (base + 5 * (+m[2] || 0)) / 100 : 0;
}
function slotOf(id) {
  if (/^T\d_HEAD_/.test(id)) return 'head';
  if (/^T\d_ARMOR_/.test(id)) return 'armor';
  if (/^T\d_SHOES_/.test(id)) return 'shoes';
  if (/^T\d_(MAIN|2H)_/.test(id)) return 'main';
  if (/^T\d_OFF_/.test(id)) return 'off';
  if (/^T\d_CAPE/.test(id)) return 'cape';
  if (/^T\d_POTION/.test(id)) return 'potion';
  if (/^T\d_MEAL/.test(id)) return 'food';
  if (/^T\d_BAG(@|$)/.test(id)) return 'bag';
  if (/_MOUNT_/.test(id)) return 'mount';
  return '';
}
function mountOpts() {
  return [{ v: '', name: 'Без маунта', sub: '0 кг' },
    ...MOUNTS.map(m => ({ v: m[0], img: m[0], name: m[1], sub: (/^T\d/.test(m[0]) ? m[0].slice(0, 2) + ' · ' : '') + fmt(m[2]) + ' кг' }))];
}
function bagOpts() {
  return [{ v: 0, name: 'Без сумки', sub: '0 кг' },
    ...[2,3,4,5,6,7,8].map(t => { const e = t < 4 ? 0 : cargo.bagE;
      return { v: t, img: `T${t}_BAG` + (e ? '@' + e : ''), name: BAGS[t] || 'Сумка T' + t, sub: tag(t, e) + ' · ' + fmt(bagKg(t, e)) + ' кг' }; })];
}
function gearOpts(slot) {
  const q = gearQ.trim().toLowerCase(), t = String(cargo.gTier);
  const list = ITEMS.filter(i => i[0][1] === t && enchOf(i[0]) === cargo.gEnch && slotOf(i[0]) === slot && (!q || i[1].toLowerCase().includes(q))).slice(0, 60);
  return [{ v: '', name: 'Снять', sub: '' }, ...list.map(i => { const p = pieOf(i[0]);
    return { v: i[0], img: i[0], name: shortName(i[1]), sub: p ? '+' + Math.round(p * 100) + '% груза' : kg(i[3]) + ' кг' }; })];
}
function slotItem(k) {
  if (k === 'bag') return cargo.bagT ? { img: bagId(), tg: tag(cargo.bagT, bagEnch()) } : null;
  if (k === 'mount') return cargo.mount ? { img: cargo.mount, tg: /^T\d/.test(cargo.mount) ? cargo.mount.slice(0, 2) : '' } : null;
  const id = cargo.gear[k]; return id ? { img: id, tg: tierOf(id), q: cargo.qual[k] || 1 } : null;
}
function drawSlots() {
  $('slots').innerHTML = SLOTS.map(([k, t]) => {
    if (!k) return '<span></span>';
    const it = slotItem(k);
    return `<button type="button" class="slot${cargo.slot === k ? ' on' : ''}" data-s="${k}" title="${t}">${it ? `<img src="${IMG(it.img, it.q ? '&quality=' + it.q : '')}" alt=""><em>${it.tg}</em>` : t}</button>`;
  }).join('');
}
function segHtml(name, values, labels, cur, disabled) {
  return `<div class="seg">${values.map((v, i) => `<button type="button" data-seg="${name}" data-v="${v}" class="${cur === v ? 'on' : ''}"${disabled ? ' disabled' : ''}>${labels[i]}</button>`).join('')}</div>`;
}
function drawTiles() {
  const k = cargo.slot; if (!k) return;
  let cur;
  if (k === 'mount') { panelOpts = mountOpts(); cur = cargo.mount; }
  else if (k === 'bag') { panelOpts = bagOpts(); cur = cargo.bagT; }
  else { panelOpts = gearOpts(k); cur = cargo.gear[k] || ''; }
  $('panelTiles').innerHTML = panelOpts.map((o, i) =>
    `<button type="button" class="tile${o.v === cur ? ' on' : ''}" data-i="${i}">${o.img ? `<img loading="lazy" src="${IMG(o.img)}" alt="">` : '<span class="noimg">—</span>'}<b>${esc(o.name)}</b><i>${o.sub}</i></button>`).join('')
    + (k !== 'mount' && k !== 'bag' && panelOpts.length === 1 ? '<span class="dim" style="grid-column:1/-1;padding:8px">Ничего не найдено — поменяй тир или поиск.</span>' : '');
}
function drawPanel() {
  const p = $('slotPanel'), k = cargo.slot;
  p.hidden = !k; if (!k) return;
  let extra = '';
  if (k === 'bag') extra = segHtml('bagE', [0,1,2,3,4], ['.0','.1','.2','.3','.4'], bagEnch(), cargo.bagT < 4);
  else if (k !== 'mount') {
    const cons = CONS.includes(k);
    if (!cons && cargo.gTier < 4) cargo.gTier = 4;
    if (cons && cargo.gEnch > 3) cargo.gEnch = 0;
    const tiers = cons ? [1,2,3,4,5,6,7,8] : [4,5,6,7,8], en = cons ? [0,1,2,3] : [0,1,2,3,4];
    extra = `<input type="text" id="gearQ" placeholder="поиск по названию" value="${esc(gearQ)}">`
      + segHtml('gTier', tiers, tiers.map(t => 'T' + t), cargo.gTier, false)
      + segHtml('gEnch', en, en.map(e => '.' + e), cargo.gEnch, false)
      + (cons ? '' : segHtml('q', [1,2,3,4,5], ['Обыч.','Хор.','Выд.','Отл.','Шед.'], cargo.qual[k] || 1, false));
  }
  p.innerHTML = `<div class="ph"><b>${SLOT_RU[k]}</b><button type="button" class="mini" data-x="1">Закрыть</button></div>${extra}<div class="tiles" id="panelTiles"></div>`;
  drawTiles();
}
function cartSum() {
  let cost = 0, w = 0, profit = 0, n = 0;
  for (const c of cart) { cost += c.qty * c.cost; w += c.qty * c.w; profit += c.qty * c.profit; n += c.qty; }
  return { cost, w, profit, n };
}
function capacity() {
  const bag = cargo.bagT ? bagKg(cargo.bagT, bagEnch()) : 0;
  const m = MOUNTS.find(x => x[0] === cargo.mount), mount = m ? m[2] : 0;
  const pie = pieOf(cargo.gear.food);
  const custom = num('customKg'), used = Math.max(0, num('usedKg'));
  // надетое снаряжение тоже весит: шесть ячеек экипировки и сама сумка
  let worn = 0;
  for (const k of WEAR) if (cargo.gear[k]) worn += WEIGHT.get(cargo.gear[k]) || 0;
  if (cargo.bagT) worn += WEIGHT.get(`T${cargo.bagT}_BAG`) || ({ 2: 1.5, 3: 2.3 })[cargo.bagT] || 0;
  const total = custom > 0 ? custom : (BASE_LOAD + bag + mount) * (1 + pie);
  const cs = cartSum(), budget = Math.max(0, num('silver'));
  const load = used + worn + cs.w;
  return { bag, mount, pie, custom: custom > 0, used, worn, total, cartW: cs.w, cartCost: cs.cost, budget,
    free: Math.max(0, total - load), budgetLeft: budget > 0 ? Math.max(0, budget - cs.cost) : Infinity,
    loadPct: total > 0 ? load / total * 100 : 0 };
}
// штраф к скорости при перегрузе — таблица из данных игры
function speedNote(p) {
  if (p > 800) return 'двигаться нельзя';
  for (const [lim, sp] of [[200, 8], [180, 15], [160, 30], [130, 50], [100, 80]]) if (p > lim) return 'перегруз: скорость ' + sp + '%';
  return '';
}
function drawCap() {
  const c = capacity();
  $('capBox').innerHTML = `<span class="big">${fmt(c.free)} кг</span> свободно` +
    (c.custom ? `<div>Используется твой лимит: ${fmt(c.total)} кг</div>`
      : `<div>Персонаж ${BASE_LOAD} + сумка ${fmt(c.bag)} + маунт ${fmt(c.mount)}${c.pie ? `, пирог +${Math.round(c.pie * 100)}%` : ''} = ${fmt(c.total)} кг</div>`) +
    `<div>Надето ${kg(c.worn)} кг${c.used ? `, уже занято ${kg(c.used)} кг` : ''}${c.cartW ? `, корзина ${kg(c.cartW)} кг` : ''}</div>`;
  $('capChip').textContent = 'Свободно: ' + fmt(c.free) + ' кг';
  const note = speedNote(c.loadPct);
  $('wfill').style.width = Math.min(100, c.loadPct) + '%';
  $('wbar').classList.toggle('over', c.loadPct > 100);
  $('wtext').textContent = Math.round(c.loadPct) + '%' + (note ? ' — ' + note : '');
}
function cargoChanged() {
  if (cargo.bagT < 4) cargo.bagE = 0;
  drawSlots(); drawPanel(); drawCap(); saveCfg(); render(); renderCart();
}
$('slots').onclick = e => {
  const b = e.target.closest('.slot'); if (!b) return;
  cargo.slot = cargo.slot === b.dataset.s ? '' : b.dataset.s; gearQ = '';
  drawSlots(); drawPanel();
};
$('slotPanel').onclick = e => {
  if (e.target.closest('[data-x]')) { cargo.slot = ''; drawSlots(); drawPanel(); return; }
  const sg = e.target.closest('[data-seg]'), k = cargo.slot;
  if (sg && !sg.disabled) { if (sg.dataset.seg === 'q') cargo.qual[k] = +sg.dataset.v; else cargo[sg.dataset.seg] = +sg.dataset.v; return cargoChanged(); }
  const t = e.target.closest('.tile'); if (!t) return;
  const v = panelOpts[+t.dataset.i].v;
  if (k === 'mount') cargo.mount = v;
  else if (k === 'bag') cargo.bagT = v;
  else {
    if (v) cargo.gear[k] = v; else delete cargo.gear[k];
    // двуручное оружие и предмет в левой руке вместе не носятся
    if (k === 'main' && /^T\d_2H_/.test(v)) delete cargo.gear.off;
    if (k === 'off' && v && /^T\d_2H_/.test(cargo.gear.main || '')) delete cargo.gear.main;
  }
  cargoChanged();
};
$('slotPanel').oninput = e => { if (e.target.id === 'gearQ') { gearQ = e.target.value; drawTiles(); } };

// ---------- набор снаряжения: обмен с игрой через буфер ----------
// Формат игры: {"version":1,"name":"...","equipment":[{"item":"T4_2H_QUARTERSTAFF@2","quality":3}, ...]}
function loadoutObj() {
  const g = cargo.gear, eq = [], add = (item, q) => { if (item) eq.push({ item, quality: q || 1 }); };
  for (const k of ['main', 'off', 'head', 'armor', 'shoes', 'cape']) add(g[k], cargo.qual[k]);
  add(bagId(), 1); add(cargo.mount, 1); add(g.potion, 1); add(g.food, 1);
  return { version: 1, name: $('loName').value.trim() || 'Albion Flip', equipment: eq };
}
function applyLoadout(text) {
  let o = null;
  try { o = JSON.parse(text); } catch (e) {}
  if (!o || !Array.isArray(o.equipment)) return setStatus('Это не набор снаряжения из игры: ожидается текст, который игра копирует кнопкой «поделиться» в окне наборов.');
  cargo.gear = {}; cargo.qual = {}; cargo.mount = ''; cargo.bagT = 0; cargo.bagE = 0;
  let n = 0;
  for (const e of o.equipment) {
    const id = safeId(e && e.item), k = id ? slotOf(id) : ''; if (!k) continue;
    n++;
    if (k === 'bag') { cargo.bagT = +id[1] || 0; cargo.bagE = enchOf(id); }
    else if (k === 'mount') cargo.mount = id;
    else { cargo.gear[k] = id; cargo.qual[k] = Math.max(1, Math.min(5, parseInt(e.quality, 10) || 1)); }
  }
  if (o.name) $('loName').value = o.name;
  cargoChanged();
  setStatus(`Набор «${o.name || 'без названия'}» загружен, предметов: ${n}.`);
}
$('loCopy').onclick = () => {
  const o = loadoutObj();
  if (!o.equipment.length) return setStatus('Рюкзак пуст — сначала выбери предметы в ячейках.');
  copyText(JSON.stringify(o), `Набор «${o.name}» скопирован. В игре открой наборы снаряжения и создай набор из буфера обмена.`);
};
$('loPaste').onclick = async () => {
  let t = '';
  try { t = await navigator.clipboard.readText(); } catch (e) {}
  if (!t || t.trim()[0] !== '{') t = prompt('Вставь сюда набор, скопированный в игре (Ctrl+V):') || '';
  if (t) applyLoadout(t);
};
$('loName').oninput = saveCfg;

// ---------- расчёт сделок ----------
function ageH(d) { return (!d || d.startsWith('0001')) ? Infinity : (Date.now() - Date.parse(d + 'Z')) / 36e5; }
function fmtAge(h) {
  if (!isFinite(h)) return '—';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' мин';
  if (h < 48) return Math.round(h) + ' ч';
  return Math.round(h / 24) + ' дн';
}
const dealKey = r => r.id + '|' + r.q + '|' + r.b + '|' + r.bm + '|' + r.s + '|' + r.sm;
const volKey = r => r.id + '|' + r.q + '|' + r.s;
// варианты покупки: [способ, цена за штуку, затраты с учётом сбора, возраст цены]
function buysOf(pb, c) {
  const out = [];
  // сразу: берём самое дешёвое предложение продавца, без сбора
  if (c.buyMode !== 'order' && pb.sell_price_min > 0) out.push(['Сразу', pb.sell_price_min, pb.sell_price_min, ageH(pb.sell_price_min_date)]);
  // заказ: ставим на 1 серебро выше лучшего заказа и платим сбор за размещение
  if (c.buyMode !== 'instant' && pb.buy_price_max > 0) out.push(['Заказ', pb.buy_price_max + 1, (pb.buy_price_max + 1) * (1 + c.setup), ageH(pb.buy_price_max_date)]);
  return out;
}
// варианты продажи: [способ, цена за штуку, выручка после налога и сбора, возраст цены]
function sellsOf(ps, c, bm) {
  const out = [];
  // сразу: продаём в лучший заказ покупателя, только налог (на Чёрном рынке по-другому нельзя)
  if ((c.sellMode !== 'order' || bm) && ps.buy_price_max > 0) out.push(['Сразу', ps.buy_price_max, ps.buy_price_max * (1 - c.tax), ageH(ps.buy_price_max_date)]);
  // заказ: выставляем на 1 серебро дешевле лучшего предложения, налог + сбор
  if (c.sellMode !== 'instant' && !bm && ps.sell_price_min > 1) out.push(['Заказ', ps.sell_price_min - 1, (ps.sell_price_min - 1) * (1 - c.tax - c.setup), ageH(ps.sell_price_min_date)]);
  return out;
}
// Чёрный рынок стоит в Карлеоне, поэтому Карлеон → Чёрный рынок тоже «без перевозки»
function routeOk(c, b, s) { return !c.sameCity || b === s || (s === BM && b === 'Caerleon'); }
function passes(c, pct, age) { return pct >= c.minPct && pct <= c.maxPct && age <= c.maxAge; }

function compute(prev) {
  const c = cfg();
  rows = []; newCount = 0;
  for (const e of raw.values()) {
    for (const b of c.buy) {
      const pb = e.c[b]; if (!pb) continue;
      const buys = buysOf(pb, c); if (!buys.length) continue;
      for (const s of c.sell) {
        const ps = e.c[s]; if (!ps || !routeOk(c, b, s)) continue;
        for (const bu of buys) for (const se of sellsOf(ps, c, s === BM)) {
          if (b === s && bu[0] === 'Сразу' && se[0] === 'Сразу') continue;
          const profit = se[2] - bu[2], pct = profit / bu[2] * 100, age = Math.max(bu[3], se[3]);
          if (!passes(c, pct, age)) continue;
          const r = { id: e.id, name: nameOf(e.id), tier: tierOf(e.id), q: e.q, w: WEIGHT.get(e.id) || 0,
            b, bm: bu[0], bp: bu[1], cost: bu[2], s, sm: se[0], sp: se[1], profit, pct, age, take: 0, lim: '', trip: 0, dev: -1e9, isNew: false };
          if (prev && !hidden.has(r.id) && !prev.has(dealKey(r))) { r.isNew = true; newCount++; }
          rows.push(r);
        }
      }
    }
  }
  computeEnch(c);
  render();
}

// зачарование: купить предмет уровня L, докупить руны/души/реликвии, продать уровень L+1
function computeEnch(c) {
  enchRows = [];
  for (const e of raw.values()) {
    const L = enchOf(e.id), tid = e.id.replace(/@\d+$/, '') + '@' + (L + 1), up = UPG[tid];
    if (!up) continue;
    const te = raw.get(tid + '|' + e.q), re = resP.get(up[0] + '|1');
    if (!te || !re) continue;
    for (const b of c.buy) {
      const pb = e.c[b], pr = re.c[b];
      if (!pb || !pr || !(pr.sell_price_min > 0)) continue;
      const mat = up[1] * pr.sell_price_min, matAge = ageH(pr.sell_price_min_date);
      for (const bu of buysOf(pb, c)) for (const s of c.sell) {
        const ps = te.c[s]; if (!ps || !routeOk(c, b, s)) continue;
        for (const se of sellsOf(ps, c, s === BM)) {
          const cost = bu[2] + mat, profit = se[2] - cost, pct = profit / cost * 100, age = Math.max(bu[3], se[3], matAge);
          if (!passes(c, pct, age)) continue;
          enchRows.push({ id: tid, q: e.q, from: tierOf(e.id), to: tierOf(tid), b, bm: bu[0], bp: bu[1], res: up[0], cnt: up[1], rp: pr.sell_price_min, mat, s, sm: se[0], sp: se[1], profit, pct, age });
        }
      }
    }
  }
  enchRows.sort((x, y) => y.pct - x.pct);
  const q = $('search').value.trim().toLowerCase();
  const list = enchRows.filter(r => !hidden.has(r.id) && (!q || nameOf(r.id).toLowerCase().includes(q)));
  $('enchBody').innerHTML = list.slice(0, MAX_ROWS).map(r => `<tr>
    ${itemCell(r.id, r.q, QUAL_RU[r.q] || r.q)}<td>${tierPill(r.from)} <span class="dim">→</span> ${tierPill(r.to)}</td>
    <td>${cityTag(r.b, r.bm)}</td><td class="n">${fmt(r.bp)}</td>
    <td>${fmt(r.cnt)} × ${esc(shortName(nameOf(r.res)))} <span class="dim">по ${fmt(r.rp)}</span></td><td class="n">${fmt(r.mat)}</td>
    <td>${cityTag(r.s, r.sm)}</td><td class="n">${fmt(r.sp)}</td>
    <td class="n">${fmt(r.profit)}</td><td class="n pct${r.pct < 0 ? ' neg' : ''}">${r.pct.toFixed(0)}%</td><td class="n dim">${fmtAge(r.age)}</td></tr>`).join('');
  $('enchEmpty').style.display = list.length ? 'none' : '';
  $('enchEmpty').textContent = raw.size ? 'Выгодного зачарования под эти условия нет. Снизь порог прибыли или проверь, что включены соседние уровни зачарования.' : 'Пока пусто — нажми «Сканировать».';
}

function sortVal(r, k) {
  if (k === 'vol') { const v = vol.get(volKey(r)); return v == null ? -1 : v; }
  if (k === 'b' || k === 's') return CITY_RU[r[k]];
  return r[k];
}
function render() {
  const q = $('search').value.trim().toLowerCase(), cap = capacity();
  view = rows.filter(r => !hidden.has(r.id) && (!q || r.name.toLowerCase().includes(q)));
  for (const r of view) {
    // сколько штук реально взять: вес, потом серебро, потом спрос за день
    let n = r.w > 0 ? Math.floor(cap.free / r.w) : 0, lim = 'вес';
    if (isFinite(cap.budgetLeft)) { const m = Math.floor(cap.budgetLeft / r.cost); if (m < n) { n = m; lim = 'серебро'; } }
    const v = vol.get(volKey(r));
    if (v != null) { const m = Math.ceil(v); if (m < n) { n = m; lim = 'спрос'; } }
    r.take = n; r.lim = lim; r.trip = n * r.profit;
    const a = avgp.get(volKey(r)); r.dev = a > 0 ? (r.sp / a - 1) * 100 : -1e9;
  }
  view.sort((x, y) => {
    const a = sortVal(x, sortKey), b = sortVal(y, sortKey);
    return (a < b ? -1 : a > b ? 1 : 0) * sortDir || y.pct - x.pct;
  });
  document.querySelectorAll('#head th').forEach(th => {
    const on = th.dataset.k === sortKey;
    th.classList.toggle('sorted', on);
    th.classList.toggle('asc', on && sortDir > 0);
    th.classList.toggle('desc', on && sortDir < 0);
  });
  const maxAge = num('maxAge') || Infinity;
  $('body').innerHTML = view.slice(0, MAX_ROWS).map((r, i) => {
    const v = vol.get(volKey(r)), hasDev = r.dev > -1e8;
    return `<tr data-i="${i}"${r.isNew ? ' class="new"' : ''}>
      <td class="act"><button type="button" data-a="add" title="В корзину">＋</button><button type="button" data-a="hide" title="Скрыть этот предмет">✕</button></td>
      ${itemCell(r.id, r.q, QUAL_RU[r.q] || r.q)}<td>${tierPill(r.tier)}</td>
      <td>${cityTag(r.b, r.bm)}</td><td class="n">${fmt(r.bp)}</td>
      <td>${cityTag(r.s, r.sm)}</td><td class="n">${fmt(r.sp)}</td>
      <td class="n">${fmt(r.profit)}</td><td class="n pct${r.pct < 0 ? ' neg' : ''}">${r.pct.toFixed(0)}%</td>
      <td class="n dim">${r.w ? kg(r.w) : '—'}</td><td class="n">${r.w ? fmt(r.take) + ' <i class="lim">' + r.lim + '</i>' : '—'}</td><td class="n">${r.w ? fmt(r.trip) : '—'}</td>
      <td class="n">${v == null ? '<span class="dim">—</span>' : fmt(v)}</td>
      <td class="n${hasDev && r.dev > 50 ? ' old' : ' dim'}"${hasDev && r.dev > 50 ? ' title="Цена продажи сильно выше средней за неделю — проверь в игре"' : ''}>${hasDev ? (r.dev > 0 ? '+' : '') + r.dev.toFixed(0) + '%' : '—'}</td>
      <td class="n${r.age > maxAge / 2 ? ' old' : ' dim'}">${fmtAge(r.age)}</td></tr>`;
  }).join('');
  $('empty').style.display = view.length ? 'none' : '';
  $('empty').textContent = raw.size ? 'Сделок под эти условия нет. Попробуй снизить порог прибыли или увеличить возраст цен.' : 'Пока пусто.';
  $('hidBtn').hidden = !hidden.size;
  $('hidBtn').textContent = 'Скрыто: ' + hidden.size + ' — вернуть';
  if (raw.size && !busy) {
    const c = cfg(), missing = [...c.buy, ...c.sell].some(x => !scanned.has(x));
    setStatus(`Сделок: ${view.length}${view.length > MAX_ROWS ? ' (показаны первые ' + MAX_ROWS + ')' : ''}, зачарование: ${enchRows.length}. Проверено позиций: ${raw.size}.` +
      (newCount ? ` Новых с прошлого раза: ${newCount}.` : '') +
      (missing ? ' Выбраны новые города — нажми «Сканировать», чтобы загрузить по ним цены.' : ''));
  }
}

// ---------- корзина ----------
function addToCart(r) {
  const k = dealKey(r), qty = Math.max(1, r.take);
  const ex = cart.find(c => c.k === k);
  if (ex) ex.qty += qty;
  else cart.push({ k, id: r.id, q: r.q, name: r.name, tier: r.tier, b: r.b, bm: r.bm, bp: r.bp, cost: r.cost, s: r.s, sm: r.sm, sp: r.sp, profit: r.profit, w: r.w, qty });
  cartChanged();
  setStatus(`В корзину: ${r.name} ${r.tier} × ${qty}.`);
}
function cartChanged() { drawCap(); saveCfg(); render(); renderCart(); }
function renderCart() {
  $('cartN').textContent = cart.length;
  $('cartBody').innerHTML = cart.map((c, i) => `<tr data-i="${i}">
    <td class="act"><button type="button" data-a="del" title="Убрать из корзины">✕</button></td>
    ${itemCell(c.id, c.q, QUAL_RU[c.q] || c.q)}<td>${tierPill(c.tier)}</td>
    <td>${cityTag(c.b, c.bm)}</td><td class="n">${fmt(c.bp)}</td>
    <td>${cityTag(c.s, c.sm)}</td><td class="n">${fmt(c.sp)}</td>
    <td class="n"><input type="number" class="qty" min="1" step="1" value="${c.qty}"></td>
    <td class="n">${fmt(c.qty * c.cost)}</td><td class="n">${kg(c.qty * c.w)}</td><td class="n pct${c.profit < 0 ? ' neg' : ''}">${fmt(c.qty * c.profit)}</td></tr>`).join('');
  $('cartEmpty').style.display = cart.length ? 'none' : '';
  const s = cartSum(), cap = capacity(), note = speedNote(cap.loadPct);
  const short = cap.budget > 0 && s.cost > cap.budget;
  $('cartSum').innerHTML =
    `<div class="cardx${short ? ' warn' : ''}"><small>Затраты</small><b>${fmt(s.cost)}</b><i>${cap.budget > 0 ? (short ? 'не хватает ' + fmt(s.cost - cap.budget) : 'останется ' + fmt(cap.budget - s.cost)) + ' серебра' : 'бюджет не задан'}</i></div>` +
    `<div class="cardx${cap.loadPct > 100 ? ' warn' : ''}"><small>Вес груза</small><b>${kg(s.w)} кг</b><i>загрузка ${Math.round(cap.loadPct)}% из ${fmt(cap.total)} кг${note ? ' — ' + note : ''}</i></div>` +
    `<div class="cardx"><small>Прибыль</small><b>${fmt(s.profit)}</b><i>${s.cost > 0 ? (s.profit / s.cost * 100).toFixed(0) + '% от затрат' : ''} · ${fmt(s.n)} шт</i></div>`;
}
function cartText() {
  const s = cartSum(), lines = ['Albion Flip — список покупок'];
  cart.forEach((c, i) => lines.push(`${i + 1}. ${c.name} ${c.tier}, ${QUAL_RU[c.q] || c.q} × ${c.qty} — купить: ${CITY_RU[c.b]} (${c.bm.toLowerCase()}) по ${fmt(c.bp)} — продать: ${CITY_RU[c.s]} (${c.sm.toLowerCase()}) по ${fmt(c.sp)}`));
  lines.push(`Итого: затраты ${fmt(s.cost)}, вес ${kg(s.w)} кг, прибыль ${fmt(s.profit)}`);
  return lines.join('\n');
}
$('cartBody').onclick = e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  if (e.target.closest('[data-a=del]')) { cart.splice(+tr.dataset.i, 1); cartChanged(); }
};
$('cartBody').onchange = e => {
  if (!e.target.classList.contains('qty')) return;
  const c = cart[+e.target.closest('tr').dataset.i]; if (!c) return;
  c.qty = Math.max(1, Math.floor(+e.target.value || 1)); cartChanged();
};
$('copyCart').onclick = () => cart.length ? copyText(cartText(), 'Список покупок скопирован в буфер обмена.') : setStatus('Корзина пуста — копировать нечего.');
$('clearCart').onclick = () => { cart = []; cartChanged(); setStatus('Корзина очищена.'); };

// ---------- загрузка цен ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { setStatus('Лимит запросов к базе цен, жду 20 секунд…'); await sleep(20000); continue; }
    if (!res.ok) throw new Error('база цен ответила ' + res.status);
    return res.json();
  }
  throw new Error('база цен не отвечает из-за лимита запросов, попробуй через 5 минут');
}
function chunkIds(ids, maxLen) {
  const out = []; let cur = [], len = 0;
  for (const id of ids) {
    if (len + id.length + 1 > maxLen && cur.length) { out.push(cur); cur = []; len = 0; }
    cur.push(id); len += id.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;
}
function setBusy(b) { busy = b; $('scanBtn').disabled = b; $('stopBtn').disabled = !b; $('craftBtn').disabled = b; if ($('craftStopBtn')) $('craftStopBtn').disabled = !b; document.body.classList.toggle('is-busy', b); }
async function fetchPrices(ids, locList, quals, label) {
  const out = new Map(), chunks = chunkIds(ids, 3400), locs = locList.map(encodeURIComponent).join(',');
  const host = `https://${$('server').value}.albion-online-data.com/api/v2/stats/prices/`;
  for (let i = 0; i < chunks.length && !stop; i++) {
    setStatus(`${label}: запрос ${i + 1} из ${chunks.length}…`);
    const data = await getJson(`${host}${chunks[i].join(',')}.json?locations=${locs}&qualities=${quals.join(',')}`);
    for (const p of data) {
      const pid = safeId(p.item_id), pq = Math.max(1, Math.min(5, parseInt(p.quality, 10) || 1));
      if (!pid || !CITY_RU[p.city]) continue;
      const k = pid + '|' + pq;
      let e = out.get(k);
      if (!e) out.set(k, e = { id: pid, q: pq, c: {} });
      e.c[p.city] = p;
    }
    if (i < chunks.length - 1) await sleep(350);
  }
  return out;
}

async function scan(auto) {
  auto = auto === true;
  if (busy) return;
  const c = cfg();
  if (!ITEMS.length) return setStatus('Не найден файл items.js — он должен лежать рядом с index.html.');
  if (!c.buy.length || !c.sell.length || !c.quals.length) return setStatus('Выбери хотя бы один город покупки, место продажи и качество.');
  const ids = ITEMS.filter(([id, name, cat]) =>
    c.tiers.includes(id[1]) && c.enchs.includes(String(enchOf(id))) && c.cats.includes(cat) && (!c.search || name.toLowerCase().includes(c.search))
  ).map(i => i[0]);
  if (!ids.length) return setStatus('Под эти фильтры не попал ни один предмет.');
  const prev = auto ? new Set(rows.map(dealKey)) : null;
  const locList = [...new Set([...c.buy, ...c.sell])];
  const upIds = c.tiers.flatMap(t => ['RUNE', 'SOUL', 'RELIC'].map(r => `T${t}_${r}`));
  let fresh, up;
  stop = false; setBusy(true);
  if (!auto) { raw = new Map(); rows = []; enchRows = []; newCount = 0; document.title = BASE_TITLE; render(); }
  try {
    fresh = await fetchPrices(ids, locList, c.quals, (auto ? 'Авто-обновление' : 'Загружаю цены') + ` (предметов: ${ids.length})`);
    up = await fetchPrices(upIds, c.buy, ['1'], 'Цены рун, душ и реликвий');
  } catch (err) {
    setBusy(false); armAuto();
    return setStatus('Ошибка: ' + err.message + '. Проверь интернет и попробуй ещё раз.');
  }
  raw = fresh; resP = up; scanned = new Set(locList);
  setBusy(false);
  compute(prev);
  if (auto && newCount) { document.title = `(${newCount}) новые сделки — Albion Flip`; if ($('soundOn').checked) beep(); }
  else document.title = BASE_TITLE;
  if (view.length) await loadVolumes();
  armAuto();
}

// спрос за день и средняя цена за неделю там, где продаём (по первым 100 строкам)
async function loadVolumes() {
  const need = view.slice(0, 100).filter(r => !vol.has(volKey(r)));
  if (!need.length || busy) return;
  const ids = [...new Set(need.map(r => r.id))];
  const locs = [...new Set(need.map(r => r.s))].map(encodeURIComponent).join(',');
  const quals = [...new Set(need.map(r => r.q))].join(',');
  const since = Date.now() - 7 * 864e5;
  setBusy(true);
  try {
    const chunks = chunkIds(ids, 1200);
    for (let i = 0; i < chunks.length; i++) {
      setStatus(`Загружаю спрос и средние цены: ${i + 1} из ${chunks.length}…`);
      const data = await getJson(`https://${$('server').value}.albion-online-data.com/api/v2/stats/history/${chunks[i].join(',')}.json?locations=${locs}&qualities=${quals}&time-scale=24`);
      for (const h of data) {
        let sum = 0, money = 0;
        for (const d of h.data || []) if (Date.parse(d.timestamp + 'Z') >= since) { sum += d.item_count; money += d.item_count * d.avg_price; }
        const k = h.item_id + '|' + h.quality + '|' + h.location;
        vol.set(k, sum / 7);
        if (sum > 0) avgp.set(k, money / sum);
      }
      if (i < chunks.length - 1) await sleep(350);
    }
    for (const r of need) if (!vol.has(volKey(r))) vol.set(volKey(r), 0);
  } catch (err) {
    setBusy(false); render();
    return setStatus('Спрос за день не загрузился: ' + err.message);
  }
  setBusy(false); render();
}

// ---------- крафт ----------
async function scanCraft() {
  if (busy) return;
  const c = cfg(), city = $('craftCity').value, rr = num('craftRet') / 100;
  const gear = $('craftGear').checked, food = $('craftFood').checked;
  if (!c.sell.length) return setStatus('Отметь слева в «Маршруте», где продавать готовое.');
  const prods = ITEMS.filter(([id, name, cat]) => RECIPES[id] && c.enchs.includes(String(enchOf(id))) && (!c.search || name.toLowerCase().includes(c.search)) &&
    ((gear && cat <= 4 && c.cats.includes(cat) && c.tiers.includes(id[1])) || (food && cat === 8))).map(i => i[0]);
  if (!prods.length) return setStatus('Под эти фильтры не попал ни один предмет с рецептом.');
  const resIds = [...new Set(prods.flatMap(id => RECIPES[id][1].map(r => r[0])))];
  const cityList = city === '*' ? CITIES.map(x => x[0]) : [city];
  let pp, rp;
  stop = false; setBusy(true);
  try {
    pp = await fetchPrices(prods, c.sell, ['1'], `Крафт: цены готовых предметов (${prods.length})`);
    rp = await fetchPrices(resIds, cityList, ['1'], `Крафт: цены ресурсов (${resIds.length})`);
  } catch (err) {
    setBusy(false);
    return setStatus('Ошибка: ' + err.message + '. Проверь интернет и попробуй ещё раз.');
  }
  setBusy(false);
  craftRows = [];
  let noPrice = 0;
  for (const id of prods) {
    const [amt, res] = RECIPES[id];
    let cost = 0, age = 0, ok = true;
    const parts = [];
    for (const [rid, cnt, noRet] of res) {
      // берём самую дешёвую цену продавца среди выбранных городов крафта
      const e = rp.get(rid + '|1');
      let row = null, at = '';
      if (e) for (const ct of cityList) { const x = e.c[ct]; if (x && x.sell_price_min > 0 && (!row || x.sell_price_min < row.sell_price_min)) { row = x; at = ct; } }
      if (!row) { ok = false; break; }
      const p = row.sell_price_min;
      cost += cnt * p * (noRet ? 1 : 1 - rr);   // артефакты при крафте не возвращаются
      age = Math.max(age, ageH(row.sell_price_min_date));
      parts.push(`${fmt(cnt)} × ${shortName(nameOf(rid))} по ${fmt(p)}` + (cityList.length > 1 ? ` (${CITY_RU[at]})` : ''));
    }
    if (!ok) { noPrice++; continue; }
    const unit = cost / amt, pe = pp.get(id + '|1');
    if (!pe) continue;
    for (const s of c.sell) {
      const ps = pe.c[s]; if (!ps) continue;
      for (const se of sellsOf(ps, c, s === BM)) {
        const profit = se[2] - unit, pct = profit / unit * 100, a = Math.max(age, se[3]);
        if (passes(c, pct, a)) craftRows.push({ id, amt, rec: parts.join(', '), unit, s, sm: se[0], sp: se[1], profit, pct, age: a });
      }
    }
  }
  craftRows.sort((x, y) => y.pct - x.pct);
  renderCraft();
  setStatus(`Крафт: выгодных вариантов ${craftRows.length} из ${prods.length} предметов. Без цены на ресурсы пропущено: ${noPrice}.`);
}
function renderCraft() {
  $('craftBody').innerHTML = craftRows.slice(0, MAX_ROWS).map(r => `<tr>
    ${itemCell(r.id, 1, r.amt > 1 ? 'за раз крафтится ' + r.amt + ' шт' : 'обычное качество')}<td>${tierPill(tierOf(r.id))}</td>
    <td class="rec" title="${esc(r.rec)}">${esc(r.rec)}</td><td class="n">${fmt(r.unit)}</td>
    <td>${cityTag(r.s, r.sm)}</td><td class="n">${fmt(r.sp)}</td>
    <td class="n">${fmt(r.profit)}</td><td class="n pct${r.pct < 0 ? ' neg' : ''}">${r.pct.toFixed(0)}%</td><td class="n dim">${fmtAge(r.age)}</td></tr>`).join('');
  $('craftEmpty').style.display = craftRows.length ? 'none' : '';
  $('craftEmpty').textContent = 'Выгодного крафта под эти условия нет. Снизь порог прибыли, увеличь возраст цен или выбери другой город.';
}
$('craftBtn').onclick = scanCraft;
['craftCity', 'craftRet', 'craftGear', 'craftFood'].forEach(id => $(id).onchange = saveCfg);

// ---------- авто-обновление и звук ----------
let autoAt = 0, audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [660, 880, 1100].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = now + i * 0.18;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.17);
    });
  } catch (e) {}
}
function armAuto() { autoAt = $('autoOn').checked ? Date.now() + Math.max(3, num('autoMin')) * 60000 : 0; }
setInterval(() => {
  if (!autoAt) { $('autoInfo').textContent = ''; return; }
  const left = autoAt - Date.now();
  if (left <= 0) { if (!busy) { autoAt = 0; scan(true); } return; }
  const s = Math.ceil(left / 1000);
  $('autoInfo').textContent = `Следующее обновление через ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}, 1000);
$('autoOn').onchange = () => { armAuto(); if ($('autoOn').checked && $('soundOn').checked) beep(); };
$('autoMin').oninput = () => { saveCfg(); armAuto(); };
$('soundOn').onchange = saveCfg;
$('testSound').onclick = beep;

// ---------- готовые наборы ----------
const ALL = CITIES.map(c => c[0]);
const PRESETS = {
  bm:     { buy: ['Caerleon'], sell: [BM], buyMode: 'both', sellMode: 'both', same: false, cats: ['0','1','2','3','4'] },
  cities: { buy: ALL, sell: ALL, buyMode: 'instant', sellMode: 'both', same: false },
  same:   { buy: ALL, sell: ALL, buyMode: 'order', sellMode: 'order', same: true }
};
document.querySelector('.presets').onclick = e => {
  const btn = e.target.closest('button[data-p]'); if (!btn) return;
  const p = PRESETS[btn.dataset.p]; if (!p) return;
  document.querySelectorAll('.presets button').forEach(b => b.classList.toggle('on', b === btn));
  setChecked('buy', p.buy); setChecked('sell', p.sell);
  if (p.cats) setChecked('cat', p.cats);
  $('buyMode').value = p.buyMode; $('sellMode').value = p.sellMode; $('sameCity').checked = p.same;
  syncChecks(); saveCfg();
  raw = new Map(); rows = []; enchRows = []; compute();
  setStatus(`Набор «${btn.textContent}» выбран — нажми «Сканировать».`);
};

// ---------- события ----------
$('scanBtn').onclick = () => scan(false);
$('stopBtn').onclick = () => { stop = true; };
if ($('craftStopBtn')) $('craftStopBtn').onclick = () => { stop = true; };
$('hidBtn').onclick = () => { hidden = new Set(); saveCfg(); compute(); };
$('premium').onchange = () => { $('tax').value = $('premium').checked ? 4 : 8; saveCfg(); if (raw.size) compute(); };
$('sameCity').onchange = () => { saveCfg(); if (raw.size) compute(); };
document.querySelectorAll('.checks input').forEach(i => i.onchange = () => { syncChecks(); saveCfg(); if (raw.size && (i.name === 'buy' || i.name === 'sell')) compute(); });
['buyMode','sellMode','minPct','maxPct','maxAge','tax','setup'].forEach(id => $(id).oninput = () => { saveCfg(); if (raw.size) compute(); });
['usedKg','customKg','silver'].forEach(id => $(id).oninput = () => { drawCap(); saveCfg(); render(); renderCart(); });
$('server').onchange = () => { saveCfg(); if (ZONES.length) drawRoutes(); };
document.querySelectorAll('details').forEach(d => d.ontoggle = saveCfg);
$('search').oninput = () => { saveCfg(); if (raw.size) compute(); else render(); };
$('search').onkeydown = e => { if (e.key === 'Enter' && !busy) scan(false); };
$('head').onclick = e => {
  const k = e.target.dataset.k; if (!k) return;
  if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = ['name','b','s','tier','age','w'].includes(k) ? 1 : -1; }
  render();
  loadVolumes();   // догружаем спрос для строк, которые поднялись наверх
};
$('body').onclick = e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const r = view[+tr.dataset.i]; if (!r) return;
  const a = e.target.closest('button');
  if (a && a.dataset.a === 'add') return addToCart(r);
  if (a && a.dataset.a === 'hide') { hidden.add(r.id); saveCfg(); render(); return setStatus(`Скрыт: ${r.name} ${r.tier}. Вернуть — кнопка «Скрыто» сверху.`); }
  const text = shortName(r.name);
  copyText(text, `Скопировано: «${text}» — вставь в поиск рынка (тир ${r.tier}, ${QUAL_RU[r.q]}).`);
};

// ---------- карта, умные маршруты и авто-проверка гангов (Killboard) ----------
const ZONES = window.AO_ZONES || [], EDGES = window.AO_EDGES || [];   // зона: [название, цвет 0-3, x, y, город]
const ZCOL = ['#4aa8ff', '#f2c94c', '#f0707a', '#8a90b4'], ZNAME = ['синяя', 'жёлтая', 'красная', 'чёрная'];
const ADJ = ZONES.map(() => []);
EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
const ZIDX = new Map(ZONES.map((z, i) => [z[0].toLowerCase(), i]));

const svg = $('mapSvg');
let routes = [], activeKind = 'safe', mapA = -1, mapB = -1, foundZone = -1, vb = [0, 0, 100, 100];

// Авто-проверка убийств гангеров каждые 5–10 минут (Albion Killboard API)
let gankKills = [];        // отфильтрованные свежие ганг-убийства
let seenKillIds = new Set();
let killsLoading = false, killsLastAt = 0, killsErr = '', killsTimer = null;
const killPriceCache = new Map(); // "${srv}|${id}" -> { p, ts }
const CARGO_MIN_SILVER = 3000000;
const KB_SERVER_PARAM = { europe: 'live_ams', west: 'live_us', east: 'live_sgp' };

function fmtSilverShort(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}М`;
  if (n >= 1000) return `${Math.round(n / 1000)}к`;
  return fmt(n);
}

function isUntradableLootId(id) {
  return /^(QUESTITEM_|T1_TRASH)|NONTRADABLE|_UNLOCK|VANITY|AVATAR/i.test(id);
}

function medianPrice(vals) {
  const pos = vals.filter(v => v > 0).sort((a, b) => a - b);
  if (!pos.length) return 0;
  return pos[Math.floor((pos.length - 1) / 2)];
}

function cachedLootPrice(srv, id) {
  const c = killPriceCache.get(`${srv}|${id}`);
  if (c && (Date.now() - c.ts) < 20 * 60 * 1000) return c.p;
  const r = raw.get(`${id}|1`) || resP.get(`${id}|1`);
  if (r && r.c) {
    const sells = [], buys = [];
    for (const p of Object.values(r.c)) {
      if (p.sell_price_min > 0) sells.push(p.sell_price_min);
      if (p.buy_price_max > 0) buys.push(p.buy_price_max);
    }
    const p = medianPrice(sells) || medianPrice(buys);
    if (p > 0) {
      killPriceCache.set(`${srv}|${id}`, { p, ts: Date.now() });
      return p;
    }
  }
  return null;
}

async function priceVictimInventories(kills, srv) {
  const need = [];
  const needSet = new Set();
  for (const k of kills) {
    for (const it of k.invItems) {
      if (isUntradableLootId(it.id)) continue;
      if (cachedLootPrice(srv, it.id) === null && !needSet.has(it.id)) {
        needSet.add(it.id);
        need.push(it.id);
      }
    }
  }
  if (need.length && !busy) {
    const locs = 'Caerleon,Bridgewatch,Fort%20Sterling,Lymhurst,Martlock,Thetford';
    const host = `https://${srv}.albion-online-data.com/api/v2/stats/prices/`;
    for (const chunk of chunkIds(need.slice(0, 140), 3200)) {
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`${host}${chunk.join(',')}.json?locations=${locs}&qualities=1`, { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) break;
        const rowsData = await r.json();
        if (!Array.isArray(rowsData)) break;
        const grouped = new Map();
        for (const row of rowsData) {
          const pid = safeId(row.item_id);
          if (!pid) continue;
          let g = grouped.get(pid);
          if (!g) grouped.set(pid, g = { sells: [], buys: [] });
          if (row.sell_price_min > 0) g.sells.push(row.sell_price_min);
          if (row.buy_price_max > 0) g.buys.push(row.buy_price_max);
        }
        const now = Date.now();
        for (const id of chunk) {
          const g = grouped.get(id);
          const p = g ? (medianPrice(g.sells) || medianPrice(g.buys)) : 0;
          killPriceCache.set(`${srv}|${id}`, { p, ts: now });
        }
      } catch (e) { break; }
    }
  }
  for (const k of kills) {
    let total = 0;
    for (const it of k.invItems) {
      if (isUntradableLootId(it.id)) continue;
      const p = cachedLootPrice(srv, it.id) || 0;
      total += p * it.cnt;
    }
    k.invValue = Math.round(total);
    // Перевозчиком считаем только если в инвентаре оценочно >= 3 000 000 серебра
    k.isTransporter = k.invValue >= CARGO_MIN_SILVER;
    if (k.isTransporter) k.royalPriority += 2;
  }
}

// Распознавание предметов сета гангера по ID предмета
function detectGankerGear(eq) {
  if (!eq) return [];
  const tags = [];
  const mh = (eq.MainHand && eq.MainHand.Type) || '';
  const ar = (eq.Armor && eq.Armor.Type) || '';
  const hd = (eq.Head && eq.Head.Type) || '';
  const pt = (eq.Potion && eq.Potion.Type) || '';
  if (/_2H_PAWS/.test(mh)) tags.push('Медвежьи лапы');
  else if (/_2H_CLAWPAIR/.test(mh)) tags.push('Когти');
  else if (/_2H_DOUBLEBLADEDSTAFF|_2H_QUARTERSTAFF|_2H_IRONCLADEDSTAFF/.test(mh)) tags.push('Двойной посох');
  else if (/_MAIN_DAGGER|_2H_DAGGERPAIR|_2H_DUALSICKLE/.test(mh)) tags.push('Кровопускатель / Кинжалы');
  else if (/_CURSEDSTAFF/.test(mh)) tags.push('Проклятый посох');
  else if (/_2H_KNUCKLES/.test(mh)) tags.push('Боевые перчатки');
  else if (/_2H_DUALSWORD|_MAIN_SCIMITAR/.test(mh)) tags.push('Парные мечи');
  else if (/_2H_RAM_KEEPER|_HAMMER/.test(mh)) tags.push('Молот (контроль)');

  if (/ARMOR_PLATE_GRAVEGUARD/.test(ar)) tags.push('Цепь хранителя');
  else if (/ARMOR_LEATHER_SET3/.test(ar)) tags.push('Куртка убийцы (инвиз)');
  else if (/ARMOR_CLOTH_HELL/.test(ar)) tags.push('Дьявольская мантия (пурж)');

  if (/HEAD_CLOTH_HELL|HEAD_LEATHER_MORGANA/.test(hd)) tags.push('Шлем чистки');
  if (/POTION_ACID|POTION_POISON/.test(pt)) tags.push('Яды');
  return tags;
}

function analyzeKillEvent(ev, kbSrv) {
  if (!ev || ev.KillArea !== 'OPEN_WORLD' || !ev.Killer || !ev.Victim) return null;
  const group = Math.max(ev.numberOfParticipants || 1, ev.groupMemberCount || 1);
  const kEq = ev.Killer.Equipment || {}, vEq = ev.Victim.Equipment || {};
  const gearTags = new Set(detectGankerGear(kEq));
  if (Array.isArray(ev.Participants)) {
    for (const p of ev.Participants) for (const t of detectGankerGear(p.Equipment)) gearTags.add(t);
  }
  const vMount = (vEq.Mount && vEq.Mount.Type) || '';
  const vBag = (vEq.Bag && vEq.Bag.Type) || '';
  const invItems = [];
  let invDrops = 0;
  if (Array.isArray(ev.Victim.Inventory)) {
    for (const slot of ev.Victim.Inventory) {
      if (!slot) continue;
      invDrops++;
      const id = safeId(slot.Type);
      const cnt = Math.max(1, parseInt(slot.Count, 10) || 1);
      if (id) invItems.push({ id, cnt });
    }
  }

  // Пропускаем дальше события с пачкой (2+), сетом гангера или инвентарём (для проверки >= 3M)
  if (group < 2 && !gearTags.size && !invItems.length) return null;

  const gearIcons = ['MainHand', 'Armor', 'Head', 'Shoes']
    .map(s => safeId(kEq[s] && kEq[s].Type))
    .filter(Boolean);

  // Определяем регион по плащу (Королевский континент / Карлеон vs Запределье)
  const cape = (kEq.Cape && kEq.Cape.Type) || (vEq.Cape && vEq.Cape.Type) || '';
  let region = 'Открытый мир (Красные / Чёрные зоны)', royalPriority = 0;
  if (/FW_CAERLEON/.test(cape)) { region = 'Красные зоны · Карлеон'; royalPriority = 3; }
  else if (/FW_BRIDGEWATCH/.test(cape)) { region = 'Королевский · Бриджвотч'; royalPriority = 2; }
  else if (/FW_LYMHURST/.test(cape)) { region = 'Королевский · Лимхерст'; royalPriority = 2; }
  else if (/FW_FORTSTERLING/.test(cape)) { region = 'Королевский · Форт-Стерлинг'; royalPriority = 2; }
  else if (/FW_THETFORD/.test(cape)) { region = 'Королевский · Тетфорд'; royalPriority = 2; }
  else if (/FW_MARTLOCK/.test(cape)) { region = 'Королевский · Мартлок'; royalPriority = 2; }
  else if (/SMUGGLER/.test(cape)) { region = 'Запределье (Контрабандист)'; royalPriority = 0; }

  return {
    id: Math.max(0, parseInt(ev.EventId, 10) || 0),
    kbSrv: KB_SERVER_PARAM[kbSrv] ? KB_SERVER_PARAM[kbSrv] : (['live_ams','live_us','live_sgp'].includes(kbSrv) ? kbSrv : 'live_ams'),
    ts: Date.parse(ev.TimeStamp) || Date.now(),
    group: Math.max(1, parseInt(group, 10) || 1),
    tags: [...gearTags].slice(0, 3),
    isTransporter: false,
    royalPriority,
    region,
    fame: Math.max(0, Number(ev.TotalVictimKillFame) || 0),
    killer: String(ev.Killer.Name || 'Неизвестно'),
    kGuild: String(ev.Killer.GuildName || ''),
    kIp: Math.max(0, Math.round(Number(ev.Killer.AverageItemPower) || 0)),
    gearIcons,
    victim: String(ev.Victim.Name || 'Неизвестно'),
    vGuild: String(ev.Victim.GuildName || ''),
    vIp: Math.max(0, Math.round(Number(ev.Victim.AverageItemPower) || 0)),
    vMount: safeId(vMount),
    vBag: safeId(vBag),
    invItems,
    invValue: 0,
    invDrops: Math.max(0, parseInt(invDrops, 10) || 0)
  };
}

function showGankToast(k, totalNew) {
  const box = $('gankToast'); if (!box) return;
  const mins = Math.max(1, Math.round((Date.now() - k.ts) / 60000));
  const tags = [
    k.group >= 2 ? `👥 Пачка ${k.group}` : '',
    k.isTransporter ? '🐂 Убит перевозчик' : '',
    ...k.tags
  ].filter(Boolean).join(' · ');
  const icons = k.gearIcons.map(id => `<img src="${IMG(id)}" alt="">`).join('');
  box.innerHTML = `
    <div class="gt-head">
      <b>⚠️ Предупреждение: ганг в открытом мире!</b>
      <button type="button" class="gt-close" title="Закрыть">✕</button>
    </div>
    <div class="gt-body">
      <div class="gt-tags">${esc(tags || 'Ганк-атака')} · <span>${mins} мин назад</span></div>
      <div class="gt-line"><b>${esc(k.killer)}</b> (${k.kIp} IP) ➔ <b>${esc(k.victim)}</b> (${k.vIp} IP)</div>
      <div class="gt-sub">📍 ${esc(k.region)}${totalNew > 1 ? ` · ещё ${totalNew - 1} нов.` : ''}</div>
      ${icons ? `<div class="gt-icons">${icons}</div>` : ''}
    </div>
    <div class="gt-actions">
      <button type="button" class="mini gt-open">Открыть сводку</button>
      <a class="mini" href="https://albiononline.com/killboard/kill/${k.id}?server=${encodeURIComponent(k.kbSrv)}" target="_blank" rel="noopener">Killboard ↗</a>
    </div>`;
  box.hidden = false;
  box.querySelector('.gt-close').onclick = () => { box.hidden = true; };
  box.querySelector('.gt-open').onclick = () => { box.hidden = true; showTab('map'); };
}

function isSafeProxyUrl(u) {
  return /^https:\/\/[^\s"'<>]+$/i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s"'<>]*)?$/i.test(u);
}
function customKillsProxy() {
  try {
    const u = (localStorage.getItem('albionflip_proxy') || '').trim();
    return isSafeProxyUrl(u) ? u : '';
  } catch (e) { return ''; }
}
function buildProxyUrl(base, srv) {
  const b = base.replace(/\/+$/, '');
  if (b.includes('{server}')) return b.replace('{server}', encodeURIComponent(srv));
  return `${b}${b.includes('?') ? '&' : '?'}server=${encodeURIComponent(srv)}`;
}

async function checkGankKills(isAuto) {
  if (killsLoading) return;
  killsLoading = true;
  killsErr = '';
  drawRoutes();
  const srv = $('server') ? $('server').value : 'europe';
  const hosts = {
    europe: 'https://gameinfo-ams.albiononline.com',
    west: 'https://gameinfo.albiononline.com',
    east: 'https://gameinfo-sgp.albiononline.com'
  };
  const baseHost = hosts[srv] || hosts.europe;
  const remote20 = `${baseHost}/api/gameinfo/events?limit=20&offset=0`;
  const sources = [];
  const cust = customKillsProxy();
  if (cust) sources.push({ url: buildProxyUrl(cust, srv), ms: 8000 });
  if (location.protocol.startsWith('http')) {
    sources.push({ url: `/api/kills?server=${encodeURIComponent(srv)}`, ms: 6000 });
  }
  if (location.protocol === 'file:' || ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port !== '8765')) {
    sources.push({ url: `http://127.0.0.1:8765/api/kills?server=${encodeURIComponent(srv)}`, ms: 3000 });
  }
  sources.push(
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(remote20)}`, ms: 9000 },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(remote20)}`, ms: 7000 }
  );

  let data = null;
  for (const s of sources) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), s.ms);
      const r = await fetch(s.url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j)) { data = j; break; }
      if (j && typeof j.contents === 'string') {
        const parsed = JSON.parse(j.contents);
        if (Array.isArray(parsed)) { data = parsed; break; }
      }
    } catch (e) {}
  }
  if (!data) {
    killsLoading = false;
    killsLastAt = Date.now();
    killsErr = location.protocol === 'file:' ? 'local-file' : 'cors-blocked';
    drawRoutes();
    return;
  }

  const kbSrv = KB_SERVER_PARAM[srv] || 'live_ams';
  const candidates = data.map(ev => analyzeKillEvent(ev, kbSrv)).filter(Boolean);
  try {
    await priceVictimInventories(candidates, srv);
  } finally {
    killsLoading = false;
    killsLastAt = Date.now();
  }
  const parsed = candidates.filter(k => k.group >= 2 || k.tags.length > 0 || k.isTransporter);
  parsed.sort((a, b) => (b.royalPriority - a.royalPriority) || (b.ts - a.ts));
  const fresh = parsed.filter(k => !seenKillIds.has(k.id));
  const hadPrevious = seenKillIds.size > 0;
  parsed.forEach(k => seenKillIds.add(k.id));
  gankKills = parsed.slice(0, 12);
  drawRoutes();

  if ($('mapStatus')) {
    $('mapStatus').textContent = gankKills.length
      ? `⚠️ Найдено ${gankKills.length} ганг-убийств в открытом мире.`
      : 'Свежих ганг-убийств не обнаружено.';
  }
  // Показываем предупреждение пользователю, если появились новые убийства (при автопроверке или свежий перевозчик/король. континент)
  if (fresh.length && (hadPrevious || !isAuto)) {
    const topAlert = fresh.find(k => k.isTransporter || k.royalPriority >= 2) || fresh[0];
    if (hadPrevious || tab !== 'map') {
      showGankToast(topAlert, fresh.length);
      if ($('soundOn') && $('soundOn').checked && hadPrevious) beep();
    }
  }
}

function armKillsCheck() {
  if (killsTimer) { clearInterval(killsTimer); killsTimer = null; }
  const mins = $('killsInt') ? num('killsInt') : 5;
  if (mins > 0) killsTimer = setInterval(() => checkGankKills(true), mins * 60 * 1000);
}

// Биомы мира Albion Online по названию зоны (для отрисовки аутентичной карты материков)
function biomeColor(name, sec) {
  if (/Caerleon|Wyre|Longtimber|Murkweald|Roastcorpse|Deadvein|Kindlegrass|Flimmerair|Mardale|Garrow|Broken Fell|Runnel Sink|Stumprot|Bowscale|Camlann/i.test(name)) return '#5e2f2f';
  if (/Frost|Glacier|Iceburn|White|Floatshoal|Everwinter|Meltwater|Avalanche|Munten|Deepwood|Timberslope|Gorge|Crevasse|Morr|Camain|Glascore|Gent|Garn|Darg|Fissure|Gorm|Fidair|Garr|Drain|Cloch|Dhor|Meagir|Chasm|Uchaf|Fenair|Kerrig|Sterling|Mountain/i.test(name)) return '#7c9cb8';
  if (/Widemoor|Willow|Drown|Runnelvein|Wetgrave|Skullmarsh|Greenshore|Longfen|Mudfoot|Deathwisp|Sunkenbough|Springsump|Scuttlesink|Timbertop|Timberscar|Fen|Marsh|Swamp|Hag|Sump|Basin|Thetford/i.test(name)) return '#2c5848';
  if (/Hightree|Giantweald|Watchwood|Rivercopse|Westweald|Greenhollow|Driftwood|Darkbough|Southgrove|Eye of the Forest|Redtree|Wood|Glen|Dell|Copse|Forest|Weald|Bourne|Redlake|Lymhurst|Inis Mon/i.test(name)) return '#355f32';
  if (/Sunstrand|Sand|Farshore|Dry|Thirstwater|Slakesands|Swiftsands|Skysand|Parch|Sunfang|Bleachskull|Northstrand|Brambleshore|Meadow|Plain|Trough|Steppe|Gully|Cleft|Fractured|Cracked|Astolat|Shiftshadow|Bridgewatch/i.test(name)) return '#8a5d32';
  return sec === 3 ? '#46444c' : '#5c564c';
}

function buildMapBg() {
  if (!ZONES.length) return '';
  const P = i => [ZONES[i][2], -ZONES[i][3]];
  let grid = '';
  for (let x = -300; x <= 250; x += 50) grid += `<line class="m-grid" x1="${x}" y1="-460" x2="${x}" y2="450"/>`;
  for (let y = -450; y <= 450; y += 50) grid += `<line class="m-grid" x1="-300" y1="${y}" x2="250" y2="${y}"/>`;

  const edgeLines = cls => EDGES.map(([a, b]) => { const p = P(a), q = P(b); return `<line class="${cls}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; }).join('');
  const zoneWalk = (r, fn) => ZONES.map((z, i) => { const p = P(i); return fn(z, i, p[0], p[1], r); }).join('');

  const reef = `<g class="layer-reef">${edgeLines('land-reef-e')}${zoneWalk(26, (z, i, x, y, r) => `<circle class="land-reef" cx="${x}" cy="${y}" r="${r}"/>`)}</g>`;
  const coast = `<g class="layer-coast">${edgeLines('land-coast-e')}${zoneWalk(19.5, (z, i, x, y, r) => `<circle class="land-coast" cx="${x}" cy="${y}" r="${r}"/>`)}</g>`;
  const base = `<g class="layer-base">${edgeLines('land-base-e')}${zoneWalk(17.5, (z, i, x, y, r) => `<circle class="land-base" cx="${x}" cy="${y}" r="${r}"/>`)}</g>`;
  const biomes = `<g class="layer-biomes">` + EDGES.map(([a, b]) => {
    const p = P(a), q = P(b), col = biomeColor(ZONES[a][0], ZONES[a][1]);
    return `<line class="land-biome-e" stroke="${col}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`;
  }).join('') + zoneWalk(16, (z, i, x, y, r) => `<circle class="land-biome" fill="${biomeColor(z[0], z[1])}" cx="${x}" cy="${y}" r="${r}"/>`) + `</g>`;

  const decor = `
    <g class="map-compass" transform="translate(-215, 345)">
      <circle cx="0" cy="0" r="22" fill="rgba(10,16,32,.55)" stroke="#5c6b9c" stroke-width="0.8"/>
      <circle cx="0" cy="0" r="18" fill="none" stroke="#5c6b9c" stroke-width="0.4" stroke-dasharray="2,2"/>
      <polygon points="0,-20 3.5,-4 0,-7 -3.5,-4" fill="#7ff0ff"/>
      <polygon points="0,20 3,-4 0,7 -3,-4" fill="#5c6b9c"/>
      <polygon points="-20,0 -4,-3 -7,0 -4,3" fill="#5c6b9c"/>
      <polygon points="20,0 4,-3 7,0 4,3" fill="#5c6b9c"/>
      <text x="0" y="-23" class="compass-lbl">N</text>
    </g>
    <text x="25" y="432" class="sea-title">КОРОЛЕВСКИЙ КОНТИНЕНТ</text>
    <text x="-20" y="-422" class="sea-title">ЗАПРЕДЕЛЬЕ · ЧЁРНЫЕ ЗОНЫ</text>
    <text x="-135" y="135" class="sea-sub">ВЕЛИКОЕ МОРЕ АЛЬБИОНА</text>`;

  return `<g class="map-world-bg">${grid}${reef}${coast}${base}${biomes}${decor}</g>`;
}
const MAP_BG_HTML = buildMapBg();

function findRoute(from, to, w, penMap) {
  const n = ZONES.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  const tx = ZONES[to][2], ty = ZONES[to][3];
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const v of ADJ[u]) {
      const z = ZONES[v], sec = z[1];
      let step = w[sec];
      if (penMap && penMap.has(v)) step += penMap.get(v);
      if (z[4] && sec === 0 && v !== to) step -= 0.005;
      const dx = z[2] - tx, dy = z[3] - ty;
      step += Math.hypot(dx, dy) * 0.00001;
      const d = dist[u] + step;
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.unshift(v);
  return path;
}

function dangerCount(p, from, to) {
  let c = 0;
  for (const i of p) if (i !== from && i !== to && ZONES[i][1] >= 2) c++;
  return c;
}
function dangerKey(p, from, to) {
  return p.filter(i => i !== from && i !== to && ZONES[i][1] >= 2).join('-');
}

// Формирует только реально отличающиеся маршруты (1, 2 или 3 — без дублирования одних и тех же красных зон)
function computeAllRoutes(from, to) {
  const pShort = findRoute(from, to, [1, 1.002, 1.04, 1.10], null);
  if (!pShort) return [];
  const pSafe = findRoute(from, to, [1, 1.002, 5.0, 50.0], null);
  const dcShort = dangerCount(pShort, from, to);
  const dcSafe = pSafe ? dangerCount(pSafe, from, to) : dcShort;
  const dkShort = dangerKey(pShort, from, to);
  const dkSafe = pSafe ? dangerKey(pSafe, from, to) : dkShort;

  const out = [];
  if (dcShort === 0) {
    out.push({ id: 'short', name: 'Оптимальный (Безопасный)', desc: 'Кратчайший путь только по мирным синим и жёлтым зонам', path: pShort });
    return out;
  }

  out.push({ id: 'short', name: 'Короткий', desc: 'Минимум переходов по прямой дороге', path: pShort });

  const hasSafer = pSafe && dcSafe < dcShort;
  if (hasSafer) {
    out.push({
      id: 'safe',
      name: dcSafe === 0 ? 'Безопасный (без красных зон)' : 'Безопасный (меньше красных зон)',
      desc: dcSafe === 0 ? 'Полностью в обход красных и чёрных зон — груз нельзя потерять' : 'Обходит лишние опасные локации по более спокойному коридору',
      path: pSafe
    });
  }

  // Альтернативный путь ищем со штрафом ТОЛЬКО на красные/чёрные зоны, чтобы не менять шило на мыло в жёлтых зонах
  const pen = new Map();
  for (const idx of pShort) if (idx !== from && idx !== to && ZONES[idx][1] >= 2) pen.set(idx, 2.5);
  if (pShort.length >= 3 && ZONES[pShort[pShort.length - 2]][1] >= 2) pen.set(pShort[pShort.length - 2], 5.0);
  if (hasSafer) for (const idx of pSafe) if (idx !== from && idx !== to && ZONES[idx][1] >= 2) pen.set(idx, 2.5);

  const pAlt = findRoute(from, to, [1, 1.002, 1.25, 4.0], pen);
  if (pAlt) {
    const dkAlt = dangerKey(pAlt, from, to), dcAlt = dangerCount(pAlt, from, to);
    if (dkAlt !== dkShort && dkAlt !== dkSafe && pAlt.length <= pShort.length + 4 && dcAlt <= dcShort + 2) {
      out.push({ id: 'alt', name: 'Обходной (другой вход)', desc: 'Идёт через другие красные зоны — пригодится, если на прямом пути стоят гангеры', path: pAlt });
    }
  }
  return out;
}

// Сводка смертей гангеров и индикатор прайм-тайма
function gankFeedHtml() {
  const srv = $('server') ? $('server').value : 'europe';
  const now = new Date(), utcH = now.getUTCHours(), utcM = now.getUTCMinutes();
  const pad = n => String(n).padStart(2, '0');
  const theSCHED = {
    europe: { name: 'Европа', peak: [15,16,17,18,19,20,21,22], quiet: [2,3,4,5,6,7,8,9,10,11] },
    west:   { name: 'Америка', peak: [23,0,1,2,3,4], quiet: [6,7,8,9,10,11,12,13] },
    east:   { name: 'Азия', peak: [11,12,13,14,15,16], quiet: [19,20,21,22,23,0,1,2] }
  };
  const sc = theSCHED[srv] || theSCHED.europe;
  const isPeak = sc.peak.includes(utcH), isQuiet = sc.quiet.includes(utcH);
  const ptBadge = isPeak
    ? `<span class="pt-pill bad">🔴 Прайм-тайм (${pad(utcH)}:${pad(utcM)} UTC)</span>`
    : isQuiet
    ? `<span class="pt-pill good">🟢 Тихий час (${pad(utcH)}:${pad(utcM)} UTC)</span>`
    : `<span class="pt-pill mid">🟡 Средний онлайн (${pad(utcH)}:${pad(utcM)} UTC)</span>`;

  let body = '';
  if (killsLoading) {
    body = `<div class="kf-status">⏳ Загружаю свежие убийства с сервера ${sc.name}…</div>`;
  } else if (killsErr) {
    const msg = killsErr === 'local-file'
      ? `<b>Браузер блокирует Killboard при открытии файла напрямую (<code>file://</code>).</b><br>Чтобы сводка работала, запусти сайт через файл <b>Запустить Albion Flip.bat</b> из папки проекта.`
      : `<b>Сервер Killboard блокирует прямые запросы без прокси (CORS).</b><br>Если запускаешь локально — используй <b>Запустить Albion Flip.bat</b>. Если открываешь по ссылке — размести сайт на <b>Vercel / Netlify</b> (прокси <code>/api/kills</code> уже встроен) или укажи свой прокси-воркер.`;
    body = `<div class="kf-status warn">
      <div>${msg}</div>
      <div class="kf-err-btns">
        <button type="button" class="mini" data-kretry="1">🔄 Повторить</button>
        <button type="button" class="mini" data-kproxy="1">⚙️ Свой прокси</button>
      </div>
    </div>`;
  } else if (!gankKills.length) {
    body = `<div class="kf-status good">✅ В последних сводках открытого мира нет убийств ганг-пачками.</div>`;
  } else {
    const transCnt = gankKills.filter(k => k.isTransporter).length;
    body = `<div class="kf-alert">
      ⚠️ <b>Осторожно:</b> за последние минуты в открытом мире зафиксировано <b>${gankKills.length}</b> ганг-убийств${transCnt ? ` (из них перевозчиков с грузом: <b>${transCnt}</b>)` : ''}!
    </div>
    <div class="kf-list">` + gankKills.slice(0, 6).map(k => {
      const mins = Math.max(1, Math.round((Date.now() - k.ts) / 60000));
      const badges = [];
      if (k.group >= 2) badges.push(`<span class="kb-tag grp">👥 Пачка ${k.group} чел.</span>`);
      if (k.isTransporter) badges.push(`<span class="kb-tag trn">🐂 Убит перевозчик</span>`);
      for (const t of k.tags) badges.push(`<span class="kb-tag set">⚔️ ${esc(t)}</span>`);

      const kIcons = k.gearIcons.map(id => `<img src="${IMG(id)}" alt="" title="${esc(nameOf(id))}">`).join('');
      const vIcons = [k.vMount, k.vBag].filter(Boolean).map(id => `<img src="${IMG(id)}" alt="" title="${esc(nameOf(id))}">`).join('');

      return `<div class="kf-item">
        <div class="kf-row1">
          <div class="kf-badges">${badges.join('')}</div>
          <span class="kf-time">${mins} мин назад</span>
        </div>
        <div class="kf-players">
          <div class="kf-side">
            <small>Гангер (${k.kIp} IP)</small>
            <b>${esc(k.killer)}</b>${k.kGuild ? ` <i>[${esc(k.kGuild)}]</i>` : ''}
            <div class="kf-gear">${kIcons}</div>
          </div>
          <div class="kf-vs">➔</div>
          <div class="kf-side">
            <small>Жертва (${k.vIp} IP)</small>
            <b>${esc(k.victim)}</b>
            <div class="kf-gear">${vIcons}<span class="kf-drops">${k.invValue > 0 ? `лут ~${fmtSilverShort(k.invValue)} (${k.invDrops} сл.)` : k.invDrops ? `лут: ${k.invDrops} сл.` : fmt(k.fame) + ' славы'}</span></div>
          </div>
        </div>
        <div class="kf-foot">
          <span>📍 ${esc(k.region)}</span>
          <a href="https://albiononline.com/killboard/kill/${k.id}?server=${encodeURIComponent(k.kbSrv)}" target="_blank" rel="noopener">Сводка ↗</a>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  return `<div class="prime-card">
    <div class="prime-top">
      <b>💀 Сводка гангов (${sc.name})</b>
      ${ptBadge}
    </div>
    <div class="prime-sub">Проверка каждые 5–10 минут: отслеживает убийства пачками, в сетах гангеров и атаки на перевозчиков.</div>
    ${body}
  </div>`;
}

function setVB(v) { vb = v; svg.setAttribute('viewBox', v.join(' ')); }
function viewFor(filter) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const z of ZONES) if (filter(z)) { x0 = Math.min(x0, z[2]); x1 = Math.max(x1, z[2]); y0 = Math.min(y0, -z[3]); y1 = Math.max(y1, -z[3]); }
  return [x0 - 22, y0 - 22, x1 - x0 + 44, y1 - y0 + 44];
}
function focusZone(idx) {
  if (idx < 0 || !ZONES[idx]) return;
  foundZone = idx;
  const z = ZONES[idx], x = z[2], y = -z[3], span = 95;
  setVB([x - span / 2, y - span / 2, span, span]);
  drawMap();
  $('mapStatus').textContent = `Найдена локация: ${z[0]} (${z[4] ? 'Город / Портал, ' : ''}${ZNAME[z[1]]} зона).`;
}
function drawMap() {
  const cur = routes.find(r => r.id === activeKind) || routes[0];
  const path = cur ? cur.path : [], on = new Set(path), P = i => [ZONES[i][2], -ZONES[i][3]];
  let h = MAP_BG_HTML;
  h += EDGES.map(([a, b]) => { const p = P(a), q = P(b); return `<line class="edge" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; }).join('');
  if (path.length > 1) {
    const pts = path.map(i => P(i).join(',')).join(' ');
    h += `<polyline class="route-glow" points="${pts}"/><polyline class="route" points="${pts}"/>`;
  }
  if (foundZone >= 0 && ZONES[foundZone]) {
    const fp = P(foundZone);
    h += `<circle class="zn-found-ring" cx="${fp[0]}" cy="${fp[1]}" r="8.5"/><circle class="zn-found-pulse" cx="${fp[0]}" cy="${fp[1]}" r="5.5"/>`;
  }
  h += ZONES.map((z, i) => {
    const p = P(i), end = i === mapA || i === mapB, isFound = i === foundZone;
    return `<circle data-i="${i}" class="zn${on.has(i) ? ' on' : ''}${end ? ' end' : ''}${z[4] ? ' city-zn' : ''}${isFound ? ' found' : ''}" cx="${p[0]}" cy="${p[1]}" r="${z[4] || end || isFound ? 3.8 : on.has(i) ? 2.8 : 2}" fill="${ZCOL[z[1]]}"><title>${esc(z[0])} — ${ZNAME[z[1]]} зона</title></circle>`;
  }).join('');
  h += ZONES.map((z, i) => {
    const big = z[4] || i === mapA || i === mapB || i === foundZone;
    if (!big && !on.has(i)) return '';
    const p = P(i);
    return `<text class="lbl${big ? '' : ' sm'}${i === foundZone ? ' found-lbl' : ''}" x="${p[0]}" y="${p[1] - (big ? 5.4 : 3.9)}">${esc(z[0])}</text>`;
  }).join('');
  svg.innerHTML = h;
}
function drawRoutes() {
  const legend = `<div class="legend">${ZNAME.map((n, i) => `<span><i style="background:${ZCOL[i]}"></i>${n}</span>`).join('')}</div>`;
  const feed = gankFeedHtml();
  if (mapA < 0 || mapB < 0 || mapA === mapB) {
    $('routes').innerHTML = legend + '<div class="dim">Выбери, откуда и куда ехать: в полях сверху или двумя кликами по карте.</div>' + feed;
    return;
  }
  if (!routes.length) {
    $('routes').innerHTML = legend + '<div class="rcard"><b>Нет пути</b><small>Пути по земле между этими зонами нет.</small></div>' + feed;
    return;
  }
  const cards = routes.map(r => {
    const p = r.path, cnt = [0, 0, 0, 0];
    p.forEach(i => cnt[ZONES[i][1]]++);
    return `<div class="rcard${r.id === activeKind ? ' on' : ''}" data-k="${r.id}"><b>${r.name}</b><small>${r.desc}</small>
      <div class="sum">Переходов: <b>${p.length - 1}</b> · ${cnt.map((c, i) => c ? `<span style="color:${ZCOL[i]}">${ZNAME[i]}: ${c}</span>` : '').filter(Boolean).join(' · ')}</div>
      <div class="zchips">${p.map(i => `<span class="zchip" style="background:${ZCOL[ZONES[i][1]]}">${esc(ZONES[i][0])}</span>`).join('')}</div></div>`;
  }).join('');
  $('routes').innerHTML = legend + cards + feed;
}
function updateRoutes() {
  const a = ZIDX.get($('mapFrom').value.trim().toLowerCase()), b = ZIDX.get($('mapTo').value.trim().toLowerCase());
  mapA = a == null ? -1 : a; mapB = b == null ? -1 : b;
  routes = (mapA >= 0 && mapB >= 0 && mapA !== mapB) ? computeAllRoutes(mapA, mapB) : [];
  if (routes.length && !routes.some(r => r.id === activeKind)) {
    activeKind = (routes.find(r => r.id === 'safe') || routes[0]).id;
  }
  $('mapStatus').textContent = mapA < 0 && $('mapFrom').value.trim() ? 'Зона «откуда» не найдена — выбери из списка.' : mapB < 0 && $('mapTo').value.trim() ? 'Зона «куда» не найдена — выбери из списка.' : 'Кликни по зоне на карте или используй поиск.';
  drawRoutes(); drawMap();
}
if (ZONES.length) {
  $('zoneList').innerHTML = ZONES.slice().sort((x, y) => y[4] - x[4] || x[0].localeCompare(y[0])).map(z => `<option value="${esc(z[0])}">${ZNAME[z[1]]}</option>`).join('');
  setVB(viewFor(z => z[1] < 3));
  $('mapFrom').oninput = $('mapTo').oninput = () => { saveCfg(); updateRoutes(); };
  $('mapSwap').onclick = () => { const t = $('mapFrom').value; $('mapFrom').value = $('mapTo').value; $('mapTo').value = t; saveCfg(); updateRoutes(); };
  $('mapRoyal').onclick = () => setVB(viewFor(z => z[1] < 3));
  $('mapAll').onclick = () => setVB(viewFor(() => true));
  if ($('checkKillsBtn')) $('checkKillsBtn').onclick = () => checkGankKills(false);
  if ($('killsInt')) $('killsInt').onchange = () => { saveCfg(); armKillsCheck(); };
  const zoomCenter = k => setVB([vb[0] + vb[2] * (1 - k) / 2, vb[1] + vb[3] * (1 - k) / 2, vb[2] * k, vb[3] * k]);
  if ($('mapZoomIn')) $('mapZoomIn').onclick = () => zoomCenter(1 / 1.25);
  if ($('mapZoomOut')) $('mapZoomOut').onclick = () => zoomCenter(1.25);

  // Поиск локации на карте по названию
  const ms = $('mapSearch'), md = $('mapSearchDrop');
  if (ms && md) {
    const renderSearchDrop = () => {
      const q = ms.value.trim().toLowerCase();
      const matches = [];
      for (let i = 0; i < ZONES.length; i++) {
        if (!q ? ZONES[i][4] : ZONES[i][0].toLowerCase().includes(q)) matches.push([ZONES[i], i]);
      }
      matches.sort((a, b) => (b[0][4] - a[0][4]) || a[0][0].localeCompare(b[0][0]));
      const top = matches.slice(0, 12);
      if (!top.length) {
        md.innerHTML = '<div class="ms-empty">Локация не найдена</div>';
      } else {
        md.innerHTML = (!q ? '<div class="ms-head">Города и порталы</div>' : '') + top.map(([z, idx]) => `
          <div class="ms-item" data-z="${idx}">
            <i class="ms-dot" style="background:${ZCOL[z[1]]}"></i>
            <span class="ms-name"><b>${esc(z[0])}</b><small>${z[4] ? 'Город / Портал · ' : ''}${ZNAME[z[1]]} зона</small></span>
            <button type="button" class="ms-btn" data-act="from" title="Сделать точкой отправления">Откуда</button>
            <button type="button" class="ms-btn" data-act="to" title="Сделать точкой назначения">Куда</button>
          </div>`).join('');
      }
      md.hidden = false;
    };
    ms.oninput = renderSearchDrop;
    ms.onfocus = renderSearchDrop;
    ms.onkeydown = e => {
      if (e.key === 'Enter') {
        const first = md.querySelector('.ms-item');
        if (first) { focusZone(+first.dataset.z); md.hidden = true; }
      } else if (e.key === 'Escape') md.hidden = true;
    };
    md.onclick = e => {
      const item = e.target.closest('.ms-item'); if (!item) return;
      const idx = +item.dataset.z, name = ZONES[idx][0];
      const btn = e.target.closest('.ms-btn');
      if (btn && btn.dataset.act === 'from') { $('mapFrom').value = name; saveCfg(); updateRoutes(); }
      else if (btn && btn.dataset.act === 'to') { $('mapTo').value = name; saveCfg(); updateRoutes(); }
      focusZone(idx);
      md.hidden = true;
    };
    document.addEventListener('click', e => { if (!e.target.closest('.map-search-wrap')) md.hidden = true; });
  }
  $('routes').onclick = e => {
    if (e.target.closest('[data-kretry]')) { checkGankKills(false); return; }
    if (e.target.closest('[data-kproxy]')) {
      const cur = customKillsProxy();
      const val = prompt('Вставь HTTPS-ссылку прокси (например, https://твой-воркер.workers.dev или https://твой-сайт.vercel.app/api/kills). Оставь пустым, чтобы сбросить:', cur);
      if (val !== null) {
        const v = val.trim();
        if (v && !isSafeProxyUrl(v)) {
          if ($('mapStatus')) $('mapStatus').textContent = 'Некорректный адрес прокси — разрешены только https:// или http://127.0.0.1.';
          return;
        }
        try { if (v) localStorage.setItem('albionflip_proxy', v); else localStorage.removeItem('albionflip_proxy'); } catch (err) {}
        checkGankKills(false);
      }
      return;
    }
    const c = e.target.closest('[data-k]');
    if (c) { activeKind = c.dataset.k; drawRoutes(); drawMap(); }
  };
  const toSvg = (e, m) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m || svg.getScreenCTM().inverse()); };
  svg.onwheel = e => { e.preventDefault(); const p = toSvg(e), k = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    setVB([p.x - (p.x - vb[0]) * k, p.y - (p.y - vb[1]) * k, vb[2] * k, vb[3] * k]); };
  let drag = null;
  svg.onpointerdown = e => { const m = svg.getScreenCTM().inverse(); drag = { m, p: toSvg(e, m), vb: vb.slice(), x: e.clientX, y: e.clientY, moved: false, target: e.target }; svg.setPointerCapture(e.pointerId); };
  svg.onpointermove = e => { if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
    if (drag.moved) { const p = toSvg(e, drag.m); setVB([drag.vb[0] - (p.x - drag.p.x), drag.vb[1] - (p.y - drag.p.y), drag.vb[2], drag.vb[3]]); } };
  svg.onpointerup = e => { const d = drag; drag = null; if (!d || d.moved) return;
    const i = d.target && d.target.dataset ? d.target.dataset.i : null; if (i == null) return;
    const name = ZONES[+i][0];
    if (mapA < 0 || (mapA >= 0 && mapB >= 0)) { $('mapFrom').value = name; $('mapTo').value = ''; } else $('mapTo').value = name;
    saveCfg(); updateRoutes(); };
  updateRoutes();
}

// Очистка ранее установленного Service Worker (если открывали старую версию)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}

// ---------- запуск ----------
const URL_ALLOWED = new Set(['q', 'search', 'mapFrom', 'mapTo', 'server', 'craftCity', 'killsInt']);
const params = new URLSearchParams(location.search);
if (params.get('q')) $('search').value = params.get('q');
for (const [k, v] of params) {
  if (!URL_ALLOWED.has(k)) continue;
  const el = $(k); if (el && 'value' in el && el.type !== 'checkbox') el.value = v;
}
if (params.get('lo')) applyLoadout(params.get('lo'));
if (params.get('mount')) cargo.mount = safeId(params.get('mount'));
if (params.get('bag')) { cargo.bagT = +params.get('bag')[0] || 0; cargo.bagE = +params.get('bag')[2] || 0; }
if (params.get('slot') && SLOT_RU[params.get('slot')]) cargo.slot = params.get('slot');
if (params.get('tab') && ['home','deals','ench','craft','map','cart'].includes(params.get('tab'))) tab = params.get('tab');
if (ZONES.length) updateRoutes();
drawSlots(); drawPanel(); drawCap(); render(); renderCart(); showTab(tab);
checkGankKills(true);
armKillsCheck();
if (params.get('auto')) scan(false).then(async () => {
  const n = +params.get('cartTop') || 0;
  if (n) view.slice(0, n).forEach(addToCart);
  if (params.get('craft')) await scanCraft();
  if (params.get('dump')) document.body.setAttribute('data-lo', JSON.stringify(loadoutObj()));
});
