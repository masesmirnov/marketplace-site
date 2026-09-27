import { EDGE, NODES } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const VIEW = { x: 20, y: 84, w: 1476, h: 988 };

const BW = 200;
const COLS = [64, 292, 520, 748, 1000, 1252];
const center = index => COLS[index] + BW / 2;
const SERVICE = { y: 640, h: 112 };
const STORE = { y: 800, h: 100 };
const BUS = { x: 64, y: 952, w: 1388, h: 64 };
const BOUNDARY = { x: 36, y: 244, w: 1444, h: 808 };
const DROP_Y = 584;

let counter = 0;

const COMMON_NODES = {
  seller: { shape: 'person', cx: 506, top: 96 },
  buyer: { shape: 'person', cx: 974, top: 96 },
  mailers: { shape: 'box', x: 59, y: 112, w: 210, h: 104 },
  psp: { shape: 'box', x: 1247, y: 112, w: 210, h: 104 },
  cabinet: { shape: 'box', x: 381, y: 292, w: 250, h: 96 },
  storefront: { shape: 'box', x: 849, y: 292, w: 250, h: 96 }
};

const COMMON_EDGES = [
  { id: 'seller-cabinet', points: [[506, 216], [506, 291]], labels: [{ x: 514, y: 262, lines: ['использует', '[HTTPS]'] }] },
  { id: 'buyer-storefront', points: [[974, 216], [974, 291]], labels: [{ x: 982, y: 262, lines: ['использует', '[HTTPS]'] }] },
  {
    id: 'buyer-psp',
    points: [[1092, 176], [1246, 176]],
    outside: true,
    labels: [{ x: 1169, y: 160, anchor: 'middle', lines: ['оплачивает заказ'] }, { x: 1169, y: 194, anchor: 'middle', lines: ['[HTTPS]'] }]
  }
];

function storeEdge(id, column, tech, storeX) {
  const x = storeX ?? COLS[column] + 100;
  return { id, points: [[x, SERVICE.y + SERVICE.h], [x, STORE.y - 1]], labels: [{ x: x + 7, y: 772, lines: ['читает и пишет', `[${tech}]`] }] };
}

function busEdges(column, items) {
  const left = typeof column === 'number' ? COLS[column] : column;
  return items.map(([id, direction, label], index) => {
    const x = left + 14 + index * 13;
    const points = direction === 'down' ? [[x, SERVICE.y + SERVICE.h], [x, BUS.y - 1]] : [[x, BUS.y], [x, SERVICE.y + SERVICE.h + 1]];
    const lx = left + 14 + (items.length - 1) * 13 + 10;
    const ly = BUS.y - 12 - (items.length - 1 - index) * 14;
    return { id, points, labels: [{ x: lx, y: ly, lines: [label], topic: true }] };
  });
}

function gatewayEdge(id, x) {
  return { id, points: [[746, 536], [746, DROP_Y], [x, DROP_Y], [x, SERVICE.y - 1]] };
}

const LAYOUTS = {
  domain: {
    bus: true,
    nodes: {
      ...COMMON_NODES,
      gateway: { shape: 'box', x: 596, y: 440, w: 300, h: 96 },
      notification: { shape: 'box', x: COLS[0], ...SERVICE, w: BW },
      user: { shape: 'box', x: COLS[1], ...SERVICE, w: BW },
      feed: { shape: 'box', x: COLS[2], ...SERVICE, w: BW },
      catalog: { shape: 'box', x: COLS[3], ...SERVICE, w: BW },
      order: { shape: 'box', x: COLS[4], ...SERVICE, w: BW },
      payment: { shape: 'box', x: COLS[5], ...SERVICE, w: BW },
      notificationDb: { shape: 'store', x: COLS[0] + 36, ...STORE, w: 160 },
      userDb: { shape: 'store', x: COLS[1] + 36, ...STORE, w: 160 },
      feedStore: { shape: 'store', x: COLS[2] + 36, ...STORE, w: 160 },
      catalogDb: { shape: 'store', x: COLS[3] + 36, ...STORE, w: 160 },
      orderDb: { shape: 'store', x: COLS[4] + 36, ...STORE, w: 160 },
      paymentDb: { shape: 'store', x: COLS[5] + 36, ...STORE, w: 160 },
      kafka: { shape: 'bus', ...BUS }
    },
    edges: [
      ...COMMON_EDGES,
      { id: 'cabinet-gateway', points: [[506, 388], [690, 439]], labels: [{ x: 586, y: 424, anchor: 'end', lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      { id: 'storefront-gateway', points: [[974, 388], [802, 439]], labels: [{ x: 906, y: 424, lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      gatewayEdge('gateway-user', center(1)),
      gatewayEdge('gateway-feed', center(2)),
      gatewayEdge('gateway-catalog', center(3)),
      gatewayEdge('gateway-order', center(4)),
      { id: 'order-catalog', points: [[COLS[4], 664], [COLS[3] + BW + 1, 664]], labels: [{ x: 974, y: 606, anchor: 'middle', lines: ['цены и резерв остатков', '[HTTP/JSON]'] }] },
      { id: 'order-payment', points: [[COLS[4] + BW, 664], [COLS[5] - 1, 664]], labels: [{ x: 1226, y: 606, anchor: 'middle', lines: ['платёж и возврат', '[HTTP/JSON]'] }] },
      { id: 'payment-psp', points: [[center(5) - 16, SERVICE.y], [center(5) - 16, 217]], labels: [{ x: center(5) - 24, y: 430, anchor: 'end', lines: ['проводит оплату, возвраты', 'и выплаты продавцам', '[HTTPS]'] }] },
      { id: 'psp-payment', points: [[center(5) + 16, 216], [center(5) + 16, SERVICE.y - 1]], labels: [{ x: center(5) + 24, y: 510, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] }] },
      { id: 'notification-mailers', points: [[center(0), SERVICE.y], [center(0), 217]], labels: [{ x: center(0) + 8, y: 462, lines: ['отправляет сообщения', '[HTTPS, SMTP]'] }] },
      storeEdge('notification-notificationDb', 0, 'SQL'),
      storeEdge('user-userDb', 1, 'SQL'),
      storeEdge('feed-feedStore', 2, 'Redis'),
      storeEdge('catalog-catalogDb', 3, 'SQL'),
      storeEdge('order-orderDb', 4, 'SQL'),
      storeEdge('payment-paymentDb', 5, 'SQL'),
      ...busEdges(0, [['kafka-notification', 'up', 'читает order.*, user.*']]),
      ...busEdges(1, [['user-kafka', 'down', 'публикует user.*']]),
      ...busEdges(2, [['kafka-feed', 'up', 'читает product.*, order.*']]),
      ...busEdges(3, [['catalog-kafka', 'down', 'публикует product.*']]),
      ...busEdges(4, [['order-kafka', 'down', 'публикует order.*'], ['kafka-order', 'up', 'читает payment.*']]),
      ...busEdges(5, [['payment-kafka', 'down', 'публикует payment.*']])
    ],
    shared: [{ edges: ['gateway-user', 'gateway-feed', 'gateway-catalog', 'gateway-order'], x: 754, y: 556, lines: ['маршрутизирует запросы', '[HTTP/JSON]'] }],
    busText: 'топики user.*, product.*, order.*, payment.*'
  },
  coarse: {
    bus: true,
    nodes: {
      ...COMMON_NODES,
      gateway: { shape: 'box', x: 596, y: 440, w: 300, h: 96 },
      engagement: { shape: 'box', x: COLS[0], ...SERVICE, w: COLS[1] + BW - COLS[0] },
      accounts: { shape: 'box', x: COLS[2], ...SERVICE, w: BW },
      commerce: { shape: 'box', x: COLS[3], ...SERVICE, w: COLS[5] + BW - COLS[3] },
      engagementStore: { shape: 'store', x: 170, ...STORE, w: 220 },
      accountsDb: { shape: 'store', x: COLS[2] + 36, ...STORE, w: 160 },
      commerceDb: { shape: 'store', x: 900, ...STORE, w: 400 },
      kafka: { shape: 'bus', ...BUS }
    },
    edges: [
      ...COMMON_EDGES,
      { id: 'cabinet-gateway', points: [[506, 388], [690, 439]], labels: [{ x: 586, y: 424, anchor: 'end', lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      { id: 'storefront-gateway', points: [[974, 388], [802, 439]], labels: [{ x: 906, y: 424, lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      gatewayEdge('gateway-engagement', center(1)),
      gatewayEdge('gateway-accounts', center(2)),
      gatewayEdge('gateway-commerce', center(4)),
      { id: 'commerce-psp', points: [[center(5) - 16, SERVICE.y], [center(5) - 16, 217]], labels: [{ x: center(5) - 24, y: 430, anchor: 'end', lines: ['проводит оплату, возвраты', 'и выплаты продавцам', '[HTTPS]'] }] },
      { id: 'psp-commerce', points: [[center(5) + 16, 216], [center(5) + 16, SERVICE.y - 1]], labels: [{ x: center(5) + 24, y: 510, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] }] },
      { id: 'engagement-mailers', points: [[center(0), SERVICE.y], [center(0), 217]], labels: [{ x: center(0) + 8, y: 462, lines: ['отправляет сообщения', '[HTTPS, SMTP]'] }] },
      storeEdge('engagement-engagementStore', 0, 'Redis, SQL', 280),
      storeEdge('accounts-accountsDb', 2, 'SQL'),
      storeEdge('commerce-commerceDb', 4, 'SQL', 1100),
      ...busEdges(0, [['kafka-engagement', 'up', 'читает user.*, product.*, order.*']]),
      ...busEdges(2, [['accounts-kafka', 'down', 'публикует user.*']]),
      ...busEdges(3, [['commerce-kafka', 'down', 'публикует product.*, order.*']])
    ],
    shared: [{ edges: ['gateway-engagement', 'gateway-accounts', 'gateway-commerce'], x: 754, y: 556, lines: ['маршрутизирует запросы', '[HTTP/JSON]'] }],
    busText: 'топики user.*, product.*, order.*; оплата — внутри «Коммерции»',
    inner: {
      commerce: { arrows: [[1, 0], [1, 2]], note: 'вызовы внутри процесса, общая транзакция' },
      engagement: { note: 'одна очередь и один процесс' }
    }
  },
  monolith: {
    bus: false,
    nodes: {
      ...COMMON_NODES,
      monolith: { shape: 'box', x: COLS[0], y: 616, w: COLS[5] + BW - COLS[0], h: 136 },
      monolithDb: { shape: 'store', x: 560, ...STORE, w: 400 }
    },
    edges: [
      ...COMMON_EDGES,
      { id: 'cabinet-monolith', points: [[506, 388], [506, 615]], labels: [{ x: 514, y: 490, lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      { id: 'storefront-monolith', points: [[974, 388], [974, 615]], labels: [{ x: 982, y: 490, lines: ['вызывает API', '[HTTPS/JSON]'] }] },
      { id: 'monolith-psp', points: [[center(5) - 16, 616], [center(5) - 16, 217]], labels: [{ x: center(5) - 24, y: 430, anchor: 'end', lines: ['проводит оплату, возвраты', 'и выплаты продавцам', '[HTTPS]'] }] },
      { id: 'psp-monolith', points: [[center(5) + 16, 216], [center(5) + 16, 615]], labels: [{ x: center(5) + 24, y: 490, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] }] },
      { id: 'monolith-mailers', points: [[center(0), 616], [center(0), 217]], labels: [{ x: center(0) + 8, y: 430, lines: ['отправляет сообщения', '[HTTPS, SMTP]'] }] },
      storeEdge('monolith-monolithDb', 0, 'SQL', 760)
    ],
    shared: [],
    inner: {
      monolith: { arrows: [[3, 2], [3, 4]], note: 'вызовы между модулями — внутри процесса; вместо событий — фоновые задачи того же приложения' }
    }
  }
};

function node(tag, attributes = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

function label(parent, x, y, text, className, anchor = 'middle') {
  parent.append(node('text', { x, y, class: className, 'text-anchor': anchor }, text));
}

function drawBox(group, spec, model, external) {
  group.append(node('rect', { x: spec.x, y: spec.y, width: spec.w, height: spec.h, rx: 12, class: 'shape' }));
  const cx = spec.x + spec.w / 2;
  if (model.modules) {
    label(group, cx, spec.y + 28, model.name, 'name');
    label(group, cx, spec.y + 45, `[${model.tech}]`, 'tech');
    return;
  }
  label(group, cx, spec.y + 31, model.name, external ? 'name ext' : 'name');
  label(group, cx, spec.y + 49, `[${model.tech}]`, external ? 'tech ext' : 'tech');
  model.desc.forEach((line, index) => label(group, cx, spec.y + 70 + index * 16, line, external ? 'desc ext' : 'desc'));
}

function drawModules(group, spec, model, inner) {
  const count = model.modules.length;
  const gap = 30;
  const chipY = spec.y + (spec.h > 120 ? 62 : 54);
  const width = Math.min(170, (spec.w - 40 - gap * (count - 1)) / count);
  const total = width * count + gap * (count - 1);
  const start = spec.x + (spec.w - total) / 2;
  const chips = model.modules.map((name, index) => {
    const x = start + index * (width + gap);
    group.append(node('rect', { x, y: chipY, width, height: 26, rx: 8, class: 'module' }));
    label(group, x + width / 2, chipY + 18, name, 'module-name');
    return { x, width };
  });
  for (const [from, to] of (inner && inner.arrows) || []) {
    const a = chips[from];
    const b = chips[to];
    const y = chipY + 13;
    const x1 = to > from ? a.x + a.width + 3 : a.x - 3;
    const x2 = to > from ? b.x - 4 : b.x + b.width + 4;
    group.append(node('path', { d: `M${x1},${y} L${x2},${y}`, class: 'inner-arrow', 'marker-end': `url(#${group.dataset.prefix}-arrow-inner)` }));
  }
  if (inner && inner.note) label(group, spec.x + spec.w / 2, chipY + 44, inner.note, 'inner-note');
}

function drawPerson(group, spec, model) {
  const x = spec.cx - 118;
  group.append(node('rect', { x, y: spec.top + 36, width: 236, height: 84, rx: 18, class: 'shape' }));
  group.append(node('circle', { cx: spec.cx, cy: spec.top + 22, r: 20, class: 'shape' }));
  label(group, spec.cx, spec.top + 64, model.name, 'name');
  label(group, spec.cx, spec.top + 81, '[Person]', 'tech');
  label(group, spec.cx, spec.top + 101, model.desc[0], 'desc');
}

function drawStore(group, spec, model) {
  const { x, y, w, h } = spec;
  const ry = 9;
  group.append(node('path', { d: `M${x},${y + ry} L${x},${y + h - ry} A${w / 2},${ry} 0 0 0 ${x + w},${y + h - ry} L${x + w},${y + ry} A${w / 2},${ry} 0 0 0 ${x},${y + ry} Z`, class: 'shape' }));
  group.append(node('ellipse', { cx: x + w / 2, cy: y + ry, rx: w / 2, ry, class: 'shape' }));
  const cx = x + w / 2;
  label(group, cx, y + 39, model.name, 'db-name');
  label(group, cx, y + 55, `[${model.tech}]`, 'tech');
  model.desc.forEach((line, index) => label(group, cx, y + 73 + index * 14, line, 'db-desc'));
}

function drawBus(group, spec, model, text) {
  const { x, y, w, h } = spec;
  const r = 16;
  group.append(node('path', { d: `M${x + r},${y} L${x + w - r},${y} A${r},${h / 2} 0 0 1 ${x + w - r},${y + h} L${x + r},${y + h} A${r},${h / 2} 0 0 1 ${x + r},${y} Z`, class: 'shape' }));
  group.append(node('ellipse', { cx: x + w - r, cy: y + h / 2, rx: r, ry: h / 2, class: 'shape' }));
  const cx = x + w / 2;
  label(group, cx, y + 27, model.name, 'name');
  label(group, cx, y + 45, `[${model.tech}]`, 'tech');
  label(group, cx, y + 59, text, 'db-desc');
}

function pathData(points) {
  return 'M' + points.map(([x, y]) => `${x},${y}`).join(' L');
}

function relLabel(parent, spec, halo) {
  spec.lines.forEach((line, index) => {
    const className = spec.topic ? 'topic' : line.startsWith('[') ? 'rel-tech' : 'rel';
    parent.append(node('text', { x: spec.x, y: spec.y + index * 14, class: `${className} ${halo}`, 'text-anchor': spec.anchor || 'start' }, line));
  });
}

function buildVariant(svg, prefix, name, interactive) {
  const layout = LAYOUTS[name];
  const root = node('g', { class: 'variant', 'data-variant': name });
  root.append(node('rect', { x: BOUNDARY.x, y: BOUNDARY.y, width: BOUNDARY.w, height: BOUNDARY.h, rx: 18, class: 'boundary' }));
  const edges = node('g', { class: 'edges' });
  const nodes = node('g', { class: 'nodes' });
  const labels = node('g', { class: 'labels' });
  root.append(edges, nodes, labels);
  const boundaryName = node('text', { x: 58, y: BOUNDARY.y + BOUNDARY.h - 13, class: 'boundary-name' });
  boundaryName.append(node('tspan', {}, 'Маркетплейс'), node('tspan', { class: 'boundary-tech', dx: 8 }, '[Software System]'));
  labels.append(boundaryName);

  for (const [id, spec] of Object.entries(layout.nodes)) {
    const model = NODES[id];
    const group = node('g', interactive
      ? { class: `node ${model.kind}`, 'data-node': id, tabindex: 0, role: 'button', 'aria-label': `${model.name}, ${model.tech}` }
      : { class: `node ${model.kind}`, 'data-node': id });
    group.dataset.prefix = prefix;
    if (spec.shape === 'person') drawPerson(group, spec, model);
    else if (spec.shape === 'store') drawStore(group, spec, model);
    else if (spec.shape === 'bus') drawBus(group, spec, model, layout.busText);
    else {
      drawBox(group, spec, model, model.kind === 'external');
      if (model.modules) drawModules(group, spec, model, layout.inner && layout.inner[id]);
    }
    nodes.append(group);
  }

  for (const spec of layout.edges) {
    const model = EDGE[spec.id];
    const kind = model.kind === 'async' ? 'async' : 'sync';
    const group = node('g', { class: `edge ${model.kind}`, 'data-edge': spec.id, 'data-from': model.from, 'data-to': model.to });
    group.append(node('path', { id: `${prefix}-${name}-${spec.id}`, d: pathData(spec.points), class: 'line', 'marker-end': `url(#${prefix}-arrow-${kind})` }));
    edges.append(group);
    const text = node('g', { class: `edge-label ${model.kind}`, 'data-edge': spec.id });
    for (const item of spec.labels || []) relLabel(text, item, spec.outside ? 'halo-out' : 'halo');
    labels.append(text);
  }
  for (const shared of layout.shared) {
    const text = node('g', { class: 'edge-label sync', 'data-edges': shared.edges.join(' ') });
    relLabel(text, shared, 'halo');
    labels.append(text);
  }
  svg.append(root);
  return root;
}

function markers(prefix) {
  const defs = node('defs');
  for (const kind of ['sync', 'async', 'inner']) {
    const marker = node('marker', { id: `${prefix}-arrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    marker.append(node('path', { d: 'M0,1 L9,5 L0,9 Z', class: `head ${kind}` }));
    defs.append(marker);
  }
  return defs;
}

function topicsOf(edge) {
  return (edge.topics || '').split(',').map(value => value.trim()).filter(Boolean);
}

export function createDiagram(host, { variants = ['domain'], variant = variants[0], title, onSelect } = {}) {
  const prefix = 'd' + ++counter;
  const interactive = Boolean(onSelect);
  const svg = node('svg', { class: interactive ? 'diagram interactive' : 'diagram', viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`, role: 'group', 'aria-label': title || 'Диаграмма контейнеров' });
  svg.append(markers(prefix));
  const roots = new Map(variants.map(name => [name, buildVariant(svg, prefix, name, interactive)]));
  host.append(svg);

  let current = null;
  let selected = null;
  let filter = 'all';

  const scope = () => roots.get(current);
  const edgesOf = () => Array.from(scope().querySelectorAll('.edge'));

  function related(id) {
    const edges = new Set();
    const nodes = new Set([id]);
    for (const element of edgesOf()) {
      const { from, to, edge } = element.dataset;
      if (from !== id && to !== id) continue;
      edges.add(edge);
      nodes.add(from === id ? to : from);
      const model = EDGE[edge];
      if (model.kind !== 'async') continue;
      const topics = topicsOf(model);
      for (const other of edgesOf()) {
        const peer = EDGE[other.dataset.edge];
        if (peer.kind !== 'async' || other.dataset.edge === edge || !topicsOf(peer).some(topic => topics.includes(topic))) continue;
        if ((model.to === 'kafka' && peer.from === 'kafka') || (model.from === 'kafka' && peer.to === 'kafka')) {
          edges.add(peer.id);
          nodes.add(peer.from === 'kafka' ? peer.to : peer.from);
        }
      }
    }
    return { edges, nodes };
  }

  function paint() {
    const root = scope();
    root.querySelectorAll('.on, .near').forEach(element => element.classList.remove('on', 'near'));
    svg.classList.toggle('focus', Boolean(selected));
    if (!selected || !root.querySelector(`[data-node="${selected}"]`)) return;
    const { edges, nodes } = related(selected);
    root.querySelector(`[data-node="${selected}"]`).classList.add('on');
    for (const id of nodes) {
      if (id !== selected) root.querySelector(`[data-node="${id}"]`)?.classList.add('near');
    }
    for (const id of edges) {
      root.querySelectorAll(`[data-edge="${id}"]`).forEach(element => element.classList.add('on'));
      root.querySelectorAll('[data-edges]').forEach(element => {
        if (element.dataset.edges.split(' ').includes(id)) element.classList.add('on');
      });
    }
  }

  function select(id) {
    selected = id && roots.get(current).querySelector(`[data-node="${id}"]`) ? id : null;
    paint();
    if (onSelect) onSelect(selected);
  }

  function setVariant(name) {
    if (!roots.has(name) || name === current) return;
    current = name;
    for (const [key, root] of roots) {
      root.classList.toggle('shown', key === name);
      root.setAttribute('aria-hidden', String(key !== name));
      if (interactive) root.querySelectorAll('.node').forEach(element => element.setAttribute('tabindex', key === name ? '0' : '-1'));
    }
    if (selected && !scope().querySelector(`[data-node="${selected}"]`)) selected = null;
    paint();
  }

  function setFilter(value) {
    filter = value;
    svg.dataset.filter = filter;
  }

  function live({ edges = [], tone = 't0', tokens = true } = {}) {
    const root = scope();
    root.querySelectorAll('.live, .token').forEach(element => {
      if (element.classList.contains('token')) element.remove();
      else element.classList.remove('live', 't0', 't1', 't2', 't3');
    });
    svg.classList.toggle('playing', Boolean(edges.length));
    const ends = new Set();
    for (const id of edges) {
      ends.add(EDGE[id].from);
      ends.add(EDGE[id].to);
    }
    for (const id of ends) root.querySelector(`[data-node="${id}"]`)?.classList.add('live', tone);
    for (const id of edges) {
      root.querySelectorAll(`[data-edge="${id}"]`).forEach(element => element.classList.add('live', tone));
      root.querySelectorAll('[data-edges]').forEach(element => {
        if (element.dataset.edges.split(' ').includes(id)) element.classList.add('live', tone);
      });
      const line = root.querySelector(`.edge[data-edge="${id}"] .line`);
      if (!tokens || !line || matchMedia('(prefers-reduced-motion: reduce)').matches) continue;
      const token = node('circle', { r: 7, class: `token ${tone}` });
      const motion = node('animateMotion', { dur: '0.9s', repeatCount: '1', fill: 'freeze', begin: 'indefinite', calcMode: 'spline', keyTimes: '0;1', keySplines: '.4 0 .2 1' });
      motion.append(node('mpath', { href: '#' + line.id }));
      token.append(motion);
      root.querySelector('.labels').append(token);
      motion.beginElement();
    }
  }

  svg.addEventListener('click', event => {
    const target = event.target.closest('.node');
    if (!onSelect) return;
    select(target && target.dataset.node !== selected ? target.dataset.node : null);
  });
  svg.addEventListener('keydown', event => {
    if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target.closest('.node');
    if (!target) return;
    event.preventDefault();
    select(target.dataset.node !== selected ? target.dataset.node : null);
  });

  setVariant(variant);
  setFilter('all');
  return { svg, setVariant, setFilter, live };
}
