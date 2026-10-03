export const VIEW = { x: 0, y: 0, w: 1280, h: 808 };
export const DOMAINS = ['notification', 'user', 'feed', 'catalog', 'order', 'payment'];
export const TOPICS = ['user', 'product', 'order', 'payment'];
export const PRODUCER = { user: 'user', product: 'catalog', order: 'order', payment: 'payment' };
export const DOMAIN_STORE = { notification: 'notificationDb', user: 'userDb', feed: 'feedStore', catalog: 'catalogDb', order: 'orderDb', payment: 'paymentDb' };

const CARD = { w: 156, h: 96 };
const COLS = [56, 244, 432, 620, 844, 1068];
const CHIP = { w: 136, h: 40 };
const ROW = 428;
const ROW_END = ROW + CARD.h;
const BUS = 396;
const STORE = { y: 572, h: 64 };
const DB = 48;
const KAFKA = { x: 56, y: 680, w: 1168, h: 72 };
const CENTER = 640;
const mid = index => COLS[index] + CARD.w / 2;
const publishX = index => COLS[index] + 14;
const consumeX = index => COLS[index] + CARD.w - 14;

export const BOUNDARY = { x: 24, y: 148, w: 1232, h: 624 };
export const KAFKA_BOX = KAFKA;
export const LANE_X = [190, 1210];
export const laneY = topic => KAFKA.y + 20 + TOPICS.indexOf(topic) * 13;

const SELLER = 416;
const BUYER = 810;

const COMMON = {
  seller: { x: SELLER - 90, y: 36, w: 180, h: 64 },
  buyer: { x: BUYER - 90, y: 36, w: 180, h: 64 },
  mailers: { x: COLS[0], y: 36, w: CARD.w, h: 64 },
  psp: { x: COLS[5], y: 36, w: CARD.w, h: 64 },
  cabinet: { x: SELLER - 100, y: 190, w: 200, h: 64 },
  storefront: { x: BUYER - 100, y: 190, w: 200, h: 64 }
};

const GATEWAY = { x: CENTER - 130, y: 300, w: 260, h: 64 };
const PSP_OUT = mid(5) - 10;
const PSP_IN = mid(5) + 10;

const COMMON_EDGES = {
  'seller-cabinet': { points: [[SELLER, 100], [SELLER, 190]], label: { x: SELLER + 10, y: 168, lines: ['использует', '[HTTPS]'] } },
  'buyer-storefront': { points: [[BUYER, 100], [BUYER, 190]], label: { x: BUYER + 10, y: 168, lines: ['использует', '[HTTPS]'] } },
  'buyer-psp': { points: [[BUYER + 90, 68], [COLS[5], 68]], label: { x: (BUYER + 90 + COLS[5]) / 2, y: 56, anchor: 'middle', lines: ['оплачивает заказ'], under: { x: (BUYER + 90 + COLS[5]) / 2, y: 88, text: '[HTTPS]' } } }
};

const GATEWAY_ENTRY = {
  'cabinet-gateway': { points: [[SELLER, 254], [SELLER, 332], [GATEWAY.x, 332]], label: { x: SELLER - 10, y: 290, anchor: 'end', lines: ['вызывает API', '[HTTPS/JSON]'] } },
  'storefront-gateway': { points: [[BUYER, 254], [BUYER, 332], [GATEWAY.x + GATEWAY.w, 332]], label: { x: BUYER + 10, y: 290, lines: ['вызывает API', '[HTTPS/JSON]'] } }
};

const branch = x => [[CENTER, GATEWAY.y + GATEWAY.h], [CENTER, BUS], [x, BUS], [x, ROW]];
const vertical = (x, from, to) => [[x, from], [x, to]];
const branchLabel = (x, text) => ({ x, y: 416, anchor: 'middle', lines: [text], branch: true });

function cards() {
  return Object.fromEntries(DOMAINS.map((domain, index) => [domain, { x: COLS[index], y: ROW, w: CARD.w, h: CARD.h, chip: false }]));
}

function chips(order) {
  return Object.fromEntries(order.map((domain, index) => [domain, { x: mid(index) - CHIP.w / 2, y: ROW + 40, w: CHIP.w, h: CHIP.h, chip: true }]));
}

function singleStores() {
  return Object.fromEntries(DOMAINS.map((domain, index) => [DOMAIN_STORE[domain], { x: mid(index) - DB / 2, y: STORE.y, w: DB, h: DB }]));
}

function bandsOf(order, x0, x1) {
  const centers = order.map(([, column]) => mid(column));
  const edges = [x0, ...centers.slice(1).map((value, index) => (centers[index] + value) / 2), x1];
  return order.map(([domain], index) => ({ domain, x0: edges[index], x1: edges[index + 1] }));
}

function storesInto(bands) {
  return Object.fromEntries(bands.map(band => [DOMAIN_STORE[band.domain], { x: band.x0, y: STORE.y, w: band.x1 - band.x0, h: STORE.h, gone: true }]));
}

const sql = (index, tech = 'SQL') => ({ points: vertical(mid(index), ROW_END, STORE.y), label: { x: mid(index) + 8, y: 552, lines: [`[${tech}]`] } });

const DOMAIN_VARIANT = {
  nodes: { ...COMMON, gateway: GATEWAY, kafka: KAFKA },
  cards: cards(),
  stores: singleStores(),
  merged: {},
  frames: {},
  container: Object.fromEntries(DOMAINS.map(domain => [domain, domain])),
  storeOf: { ...DOMAIN_STORE },
  lanes: ['user', 'product', 'order', 'payment'],
  edges: {
    ...COMMON_EDGES,
    ...GATEWAY_ENTRY,
    'gateway-user': { points: branch(mid(1)), label: branchLabel(mid(1), 'вход и ключи JWT') },
    'gateway-feed': { points: branch(mid(2)), label: branchLabel(mid(2), 'лента и просмотры') },
    'gateway-catalog': { points: branch(mid(3)), label: branchLabel(mid(3), 'карточки и правки') },
    'gateway-order': { points: branch(mid(4)), label: branchLabel(mid(4), 'корзина и заказы') },
    'order-catalog': { points: [[COLS[4], 476], [COLS[3] + CARD.w, 476]], label: { x: (COLS[3] + CARD.w + COLS[4]) / 2, y: 418, anchor: 'middle', lines: ['цены и резерв [HTTP/JSON]'] } },
    'order-payment': { points: [[COLS[4] + CARD.w, 476], [COLS[5], 476]], label: { x: (COLS[4] + CARD.w + COLS[5]) / 2, y: 418, anchor: 'middle', lines: ['платёж и возврат [HTTP/JSON]'] } },
    'payment-psp': { points: vertical(PSP_OUT, ROW, 100), label: { x: PSP_OUT - 10, y: 238, anchor: 'end', lines: ['проводит оплату,', 'возвраты, выплаты', '[HTTPS]'] } },
    'psp-payment': { points: vertical(PSP_IN, 100, ROW), label: { x: PSP_IN + 10, y: 238, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] } },
    'notification-mailers': { points: vertical(mid(0), ROW, 100), label: { x: mid(0) + 10, y: 238, lines: ['письма, SMS', 'и push', '[HTTPS, SMTP]'] } },
    'notification-notificationDb': sql(0),
    'user-userDb': sql(1),
    'feed-feedStore': sql(2, 'Redis'),
    'catalog-catalogDb': sql(3),
    'order-orderDb': sql(4),
    'payment-paymentDb': sql(5),
    'user-kafka': { points: vertical(publishX(1), ROW_END, KAFKA.y) },
    'catalog-kafka': { points: vertical(publishX(3), ROW_END, KAFKA.y) },
    'order-kafka': { points: vertical(publishX(4), ROW_END, KAFKA.y) },
    'payment-kafka': { points: vertical(publishX(5), ROW_END, KAFKA.y) },
    'kafka-notification': { points: vertical(consumeX(0), KAFKA.y, ROW_END) },
    'kafka-feed': { points: vertical(consumeX(2), KAFKA.y, ROW_END) },
    'kafka-order': { points: vertical(consumeX(4), KAFKA.y, ROW_END) }
  },
  inner: {},
  shared: { x: CENTER + 10, y: 386, lines: ['маршрутизирует [HTTP/JSON]'], edges: ['gateway-user', 'gateway-feed', 'gateway-catalog', 'gateway-order'] }
};

const COARSE_ORDER = [['notification', 0], ['feed', 1], ['user', 2], ['catalog', 3], ['order', 4], ['payment', 5]];
const engagementBands = bandsOf(COARSE_ORDER.slice(0, 2), mid(0) - 54, mid(1) + 54);
const commerceBands = bandsOf(COARSE_ORDER.slice(3), mid(3) - 54, mid(5) + 54);
const accountsBands = [{ domain: 'user', x0: mid(2) - 54, x1: mid(2) + 54 }];
const ENGAGEMENT = { x: COLS[0], y: ROW, w: COLS[1] + CARD.w - COLS[0], h: CARD.h };
const ACCOUNTS = { x: COLS[2], y: ROW, w: CARD.w, h: CARD.h };
const COMMERCE = { x: COLS[3], y: ROW, w: COLS[5] + CARD.w - COLS[3], h: CARD.h };
const centerOf = frame => frame.x + frame.w / 2;
const INNER = {
  'order>catalog': { from: 'order', to: 'catalog', points: [[mid(4) - CHIP.w / 2, ROW + 60], [mid(3) + CHIP.w / 2, ROW + 60]] },
  'order>payment': { from: 'order', to: 'payment', points: [[mid(4) + CHIP.w / 2, ROW + 60], [mid(5) - CHIP.w / 2, ROW + 60]] }
};

const COARSE_VARIANT = {
  nodes: { ...COMMON, gateway: GATEWAY, kafka: KAFKA },
  cards: chips(COARSE_ORDER.map(([domain]) => domain)),
  stores: { ...storesInto(engagementBands), ...storesInto(commerceBands), ...storesInto(accountsBands) },
  merged: {
    engagementStore: { x: engagementBands[0].x0, y: STORE.y, w: engagementBands[1].x1 - engagementBands[0].x0, h: STORE.h, bands: engagementBands },
    accountsDb: { x: mid(2) - DB / 2, y: STORE.y, w: DB, h: DB, bands: accountsBands },
    commerceDb: { x: commerceBands[0].x0, y: STORE.y, w: commerceBands[2].x1 - commerceBands[0].x0, h: STORE.h, bands: commerceBands }
  },
  frames: { engagement: ENGAGEMENT, accounts: ACCOUNTS, commerce: COMMERCE },
  container: { notification: 'engagement', feed: 'engagement', user: 'accounts', catalog: 'commerce', order: 'commerce', payment: 'commerce' },
  storeOf: { notification: 'engagementStore', feed: 'engagementStore', user: 'accountsDb', catalog: 'commerceDb', order: 'commerceDb', payment: 'commerceDb' },
  lanes: ['user', 'product', 'order'],
  edges: {
    ...COMMON_EDGES,
    ...GATEWAY_ENTRY,
    'gateway-engagement': { points: branch(mid(1)), label: branchLabel(mid(1), 'лента') },
    'gateway-accounts': { points: branch(mid(2)), label: branchLabel(mid(2), 'вход') },
    'gateway-commerce': { points: branch((mid(3) + mid(4)) / 2), label: branchLabel((mid(3) + mid(4)) / 2, 'каталог и заказы') },
    'commerce-psp': { points: vertical(PSP_OUT, ROW, 100), label: { x: PSP_OUT - 10, y: 238, anchor: 'end', lines: ['проводит оплату,', 'возвраты, выплаты', '[HTTPS]'] } },
    'psp-commerce': { points: vertical(PSP_IN, 100, ROW), label: { x: PSP_IN + 10, y: 238, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] } },
    'engagement-mailers': { points: vertical(mid(0), ROW, 100), label: { x: mid(0) + 10, y: 238, lines: ['письма, SMS', 'и push', '[HTTPS, SMTP]'] } },
    'engagement-engagementStore': { points: vertical(centerOf(ENGAGEMENT), ROW_END, STORE.y), label: { x: centerOf(ENGAGEMENT) + 8, y: 552, lines: ['[Redis, SQL]'] } },
    'accounts-accountsDb': { points: vertical(mid(2), ROW_END, STORE.y), label: { x: mid(2) + 8, y: 552, lines: ['[SQL]'] } },
    'commerce-commerceDb': { points: vertical(centerOf(COMMERCE), ROW_END, STORE.y), label: { x: centerOf(COMMERCE) + 8, y: 552, lines: ['[SQL]'] } },
    'accounts-kafka': { points: vertical(ACCOUNTS.x + 14, ROW_END, KAFKA.y) },
    'commerce-kafka': { points: vertical(COMMERCE.x + 14, ROW_END, KAFKA.y) },
    'kafka-engagement': { points: vertical(ENGAGEMENT.x + ENGAGEMENT.w - 14, KAFKA.y, ROW_END) }
  },
  inner: INNER,
  shared: { x: CENTER + 10, y: 386, lines: ['маршрутизирует [HTTP/JSON]'], edges: ['gateway-engagement', 'gateway-accounts', 'gateway-commerce'] }
};

const monolithBands = bandsOf(DOMAINS.map((domain, index) => [domain, index]), mid(0) - 54, mid(5) + 54);
const MONOLITH = { x: COLS[0], y: ROW, w: COLS[5] + CARD.w - COLS[0], h: CARD.h };

const MONOLITH_VARIANT = {
  nodes: { ...COMMON },
  cards: chips(DOMAINS),
  stores: storesInto(monolithBands),
  merged: { monolithDb: { x: monolithBands[0].x0, y: STORE.y, w: monolithBands[5].x1 - monolithBands[0].x0, h: STORE.h, bands: monolithBands } },
  frames: { monolith: MONOLITH },
  container: Object.fromEntries(DOMAINS.map(domain => [domain, 'monolith'])),
  storeOf: Object.fromEntries(DOMAINS.map(domain => [domain, 'monolithDb'])),
  lanes: [],
  edges: {
    ...COMMON_EDGES,
    'cabinet-monolith': { points: vertical(SELLER, 254, ROW), label: { x: SELLER + 10, y: 330, lines: ['вызывает API', '[HTTPS/JSON]'] } },
    'storefront-monolith': { points: vertical(BUYER, 254, ROW), label: { x: BUYER + 10, y: 330, lines: ['вызывает API', '[HTTPS/JSON]'] } },
    'monolith-psp': { points: vertical(PSP_OUT, ROW, 100), label: { x: PSP_OUT - 10, y: 238, anchor: 'end', lines: ['проводит оплату,', 'возвраты, выплаты', '[HTTPS]'] } },
    'psp-monolith': { points: vertical(PSP_IN, 100, ROW), label: { x: PSP_IN + 10, y: 238, lines: ['результат', 'оплаты', '[HTTPS, вебхук]'] } },
    'monolith-mailers': { points: vertical(mid(0), ROW, 100), label: { x: mid(0) + 10, y: 238, lines: ['письма, SMS', 'и push', '[HTTPS, SMTP]'] } },
    'monolith-monolithDb': { points: vertical(CENTER, ROW_END, STORE.y), label: { x: CENTER + 8, y: 552, lines: ['[SQL]'] } }
  },
  inner: INNER,
  shared: null
};

export const LAYOUTS = { domain: DOMAIN_VARIANT, coarse: COARSE_VARIANT, monolith: MONOLITH_VARIANT };

export function rounded(points, radius = 12) {
  if (points.length < 3) return 'M' + points.map(([x, y]) => `${x},${y}`).join(' L');
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLength = Math.hypot(x - px, y - py);
    const outLength = Math.hypot(nx - x, ny - y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ax = x - (x - px) / inLength * r;
    const ay = y - (y - py) / inLength * r;
    const bx = x + (nx - x) / outLength * r;
    const by = y + (ny - y) / outLength * r;
    d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`;
  }
  const [lx, ly] = points[points.length - 1];
  return d + ` L${lx},${ly}`;
}

export function sample(points, radius = 12) {
  const out = [];
  const push = point => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.01) out.push(point);
  };
  push(points[0]);
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    if (i < points.length - 1) {
      const [px, py] = points[i - 1];
      const [nx, ny] = points[i + 1];
      const inLength = Math.hypot(x - px, y - py);
      const outLength = Math.hypot(nx - x, ny - y);
      const r = Math.min(radius, inLength / 2, outLength / 2);
      const a = [x - (x - px) / inLength * r, y - (y - py) / inLength * r];
      const b = [x + (nx - x) / outLength * r, y + (ny - y) / outLength * r];
      push(a);
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const u = 1 - t;
        push([u * u * a[0] + 2 * u * t * x + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]);
      }
    } else {
      push([x, y]);
    }
  }
  const lengths = [0];
  for (let i = 1; i < out.length; i++) lengths.push(lengths[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { points: out, lengths, length: lengths[lengths.length - 1] };
}

export function pointAt(track, distance) {
  const { points, lengths, length } = track;
  const target = Math.max(0, Math.min(length, distance));
  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (lengths[middle] < target) low = middle;
    else high = middle;
  }
  const span = lengths[high] - lengths[low] || 1;
  const t = (target - lengths[low]) / span;
  const [x0, y0] = points[low];
  const [x1, y1] = points[high];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.atan2(y1 - y0, x1 - x0)];
}

export function join(...tracks) {
  const points = [];
  for (const part of tracks) {
    for (const point of part) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.01) points.push(point);
    }
  }
  return points;
}
