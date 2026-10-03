import { EDGE, NODES } from './model.js';
import { BOUNDARY, DOMAINS, DOMAIN_STORE, KAFKA_BOX, LANE_X, LAYOUTS, PRODUCER, TOPICS, VIEW, join, laneY, pointAt, rounded, sample } from './layout.js';

const SVG = 'http://www.w3.org/2000/svg';
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const MAX_ZOOM = 2.1;
const FOCUS_SPAN = 720;
const TOPIC_OF = Object.fromEntries(Object.entries(PRODUCER).map(([topic, domain]) => [domain, topic]));
const COMMON_IDS = ['seller', 'buyer', 'mailers', 'psp', 'cabinet', 'storefront'];
const FRAME_IDS = ['engagement', 'accounts', 'commerce', 'monolith'];
const MERGED_IDS = ['engagementStore', 'accountsDb', 'commerceDb', 'monolithDb'];
const STORE_DOMAIN = Object.fromEntries(Object.entries(DOMAIN_STORE).map(([domain, store]) => [store, domain]));
const STORE_ICONS = { PostgreSQL: 'db', Redis: 'redis' };
export const ICONS = { notification: 'bell', user: 'users', feed: 'sparkles', catalog: 'tag', order: 'receipt', payment: 'card', cabinet: 'store', storefront: 'cart', gateway: 'shield', mailers: 'mail', psp: 'bank', seller: 'person', buyer: 'person' };

const glide = t => 0.55 * t + 0.45 * t * t * (3 - 2 * t);
const round = value => Math.round(value * 100) / 100;

function svg(tag, attributes = {}, parent, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

function div(className, parent, text) {
  const node = document.createElement('div');
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

function icon(name, parent) {
  const holder = div('glyph', parent);
  holder.innerHTML = `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  return holder;
}

function short(tech) {
  return tech.replace('Container: ', '');
}

export function storeIcons(tech) {
  return short(tech).split(', ').map(name => STORE_ICONS[name]);
}

function topicsOf(edge) {
  return (edge.topics || '').split(',').map(value => value.trim().replace('.*', '')).filter(Boolean);
}

export class LiveMap {
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;
    this.variant = 'domain';
    this.layout = LAYOUTS.domain;
    this.items = new Map();
    this.edges = new Map();
    this.labels = new Map();
    this.inner = new Map();
    this.lanes = new Map();
    this.tracks = new Map();
    this.particles = new Set();
    this.warmth = new Map();
    this.down = new Set();
    this.stacks = new Map();
    this.badges = new Map();
    this.parked = new Map();
    this.selected = null;
    this.preview = null;
    this.inset = 0;
    this.view = { ...VIEW };
    this.raf = 0;
    this.revealed = false;
    this.frame = this.frame.bind(this);
    this.build();
    this.applyLayout();
    this.paintVisibility();
    this.bind();
    document.fonts.ready.then(() => this.measure());
  }

  build() {
    this.world = div('map-world', this.host);
    Object.assign(this.world.style, { width: `${VIEW.w}px`, height: `${VIEW.h}px` });
    this.world.setAttribute('role', 'group');
    this.world.setAttribute('aria-label', 'Карта контейнеров маркетплейса');
    div('map-backdrop', this.world);
    const boundary = div('map-boundary', this.world);
    Object.assign(boundary.style, { left: `${BOUNDARY.x}px`, top: `${BOUNDARY.y}px`, width: `${BOUNDARY.w}px`, height: `${BOUNDARY.h}px` });
    const legend = div('map-boundary-name', boundary, 'Маркетплейс');
    legend.append(Object.assign(document.createElement('span'), { textContent: 'Software System' }));
    this.edgeLayer = this.layer('map-lines');
    const defs = svg('defs', {}, this.edgeLayer);
    const marker = svg('marker', { id: 'arrow-line', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
    svg('path', { d: 'M0.6,1.4 L9,5 L0.6,8.6 Q2.2,5 0.6,1.4 Z', class: 'head line' }, marker);
    for (const tone of ['ink', 'mark', 'fail']) {
      const gradient = svg('linearGradient', { id: `tail-${tone}`, x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
      svg('stop', { offset: 0, class: `stop ${tone}`, 'stop-opacity': 0 }, gradient);
      svg('stop', { offset: 1, class: `stop ${tone}`, 'stop-opacity': 0.9 }, gradient);
    }
    this.routeLayer = svg('g', { class: 'routes' }, this.edgeLayer);
    this.lineLayer = svg('g', { class: 'lines' }, this.edgeLayer);
    this.trailLayer = svg('g', { class: 'trails' }, this.edgeLayer);
    this.kafkaLayer = div('map-layer map-kafka', this.world);
    this.particleLayer = this.layer('map-particles');
    this.nodeLayer = div('map-layer map-nodes', this.world);
    this.overlay = this.layer('map-overlay');
    this.labelLayer = svg('g', { class: 'labels' }, this.overlay);
    this.ringLayer = svg('g', { class: 'rings' }, this.overlay);
    this.buildKafka();
    for (const id of FRAME_IDS) this.addItem(this.frameItem(id));
    for (const domain of DOMAINS) this.addItem(this.storeItem(DOMAIN_STORE[domain]));
    for (const id of MERGED_IDS) this.addItem(this.mergedItem(id));
    for (const id of COMMON_IDS) this.addItem(this.nodeItem(id));
    this.addItem(this.nodeItem('gateway'));
    for (const domain of DOMAINS) this.addItem(this.cardItem(domain));
    this.buildEdges();
    this.stepMark = svg('g', { class: 'step-mark empty' }, this.overlay);
    svg('circle', { r: 11 }, this.stepMark);
    this.stepText = svg('text', { 'text-anchor': 'middle', y: 4 }, this.stepMark);
  }

  layer(className) {
    const node = svg('svg', { class: `map-svg ${className}`, viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, width: VIEW.w, height: VIEW.h }, this.world);
    return node;
  }

  addItem(item) {
    this.items.set(item.id, item);
  }

  shell(id, className, parent, label) {
    const node = div(`tile ${className}`, parent);
    node.dataset.node = id;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', label);
    return node;
  }

  badge(node, id) {
    const slot = div('badge empty', node);
    this.badges.set(id, slot);
    return slot;
  }

  buildKafka() {
    const node = this.shell('kafka', 'kafka', this.kafkaLayer, 'Брокер событий, Apache Kafka');
    Object.assign(node.style, { left: `${KAFKA_BOX.x}px`, top: `${KAFKA_BOX.y}px`, width: `${KAFKA_BOX.w}px`, height: `${KAFKA_BOX.h}px` });
    const head = div('kafka-head', node);
    icon('stream', head);
    const text = div('', head);
    div('name', text, 'Kafka');
    div('sub', text, 'брокер событий');
    const lanes = svg('svg', { class: 'kafka-lanes', viewBox: `${KAFKA_BOX.x} ${KAFKA_BOX.y} ${KAFKA_BOX.w} ${KAFKA_BOX.h}` }, node);
    for (const topic of TOPICS) {
      const lane = svg('g', { class: 'lane', 'data-topic': topic }, lanes);
      svg('line', { x1: LANE_X[0], x2: LANE_X[1] - 44, y1: laneY(topic), y2: laneY(topic), class: 'lane-line' }, lane);
      svg('line', { x1: LANE_X[0], x2: LANE_X[1] - 44, y1: laneY(topic), y2: laneY(topic), class: 'lane-flow' }, lane);
      svg('text', { x: LANE_X[1] - 4, y: laneY(topic) + 3.5, class: 'lane-name', 'text-anchor': 'end' }, lane, `${topic}.*`);
      this.lanes.set(topic, lane);
    }
    div('down-note', node, 'не работает');
    this.badge(node, 'kafka');
    this.addItem({ id: 'kafka', type: 'kafka', node, geom: layout => (layout.nodes.kafka ? { ...KAFKA_BOX } : null) });
  }

  nodeItem(id) {
    const model = NODES[id];
    const kind = id === 'gateway' ? 'gateway' : model.kind === 'person' ? 'person' : model.kind === 'external' ? 'external' : 'app';
    const node = this.shell(id, kind, this.nodeLayer, `${model.name}, ${short(model.tech)}`);
    if (kind === 'person') {
      const avatar = div('avatar', node);
      avatar.innerHTML = '<svg aria-hidden="true"><use href="#i-person"/></svg>';
      div('name', node, model.name);
    } else {
      icon(ICONS[id], node);
      const text = div('text', node);
      div('name', text, model.name);
      if (kind !== 'external') div('sub', text, short(model.tech));
    }
    this.badge(node, id);
    return { id, type: kind, node, geom: layout => (layout.nodes[id] ? { ...layout.nodes[id] } : null) };
  }

  cardItem(domain) {
    const model = NODES[domain];
    const node = this.shell(domain, 'card', this.nodeLayer, `${model.domain}: ${model.service}`);
    icon(ICONS[domain], node);
    div('name', node, model.domain);
    div('sub', node, model.service);
    div('down-note', node, 'не работает');
    div('stack', node);
    this.badge(node, domain);
    return { id: domain, type: 'card', node, geom: layout => ({ ...layout.cards[domain] }) };
  }

  storeItem(id) {
    const model = NODES[id];
    const node = this.shell(id, 'store', this.nodeLayer, `${model.name}, ${short(model.tech)}`);
    for (const name of storeIcons(model.tech)) icon(name, node);
    return {
      id,
      type: 'store',
      node,
      domain: STORE_DOMAIN[id],
      geom: layout => {
        const shape = layout.stores[id];
        return shape ? { ...shape, o: shape.gone ? 0 : 1 } : null;
      }
    };
  }

  mergedItem(id) {
    const variant = Object.values(LAYOUTS).find(layout => layout.merged[id]);
    const shape = variant.merged[id];
    const model = NODES[id];
    const node = this.shell(id, 'merged', this.nodeLayer, `${model.name}, ${short(model.tech)}`);
    const glyphs = div('glyphs', node);
    for (const name of storeIcons(model.tech)) icon(name, glyphs);
    if (shape.bands.length > 1) {
      const bands = div('bands', node);
      for (const band of shape.bands) {
        const part = div('band', bands, NODES[band.domain].domain.toLowerCase());
        part.style.flex = String(band.x1 - band.x0);
      }
    }
    return { id, type: 'merged', node, geom: layout => (layout.merged[id] ? { ...layout.merged[id] } : null) };
  }

  frameItem(id) {
    const model = NODES[id];
    const node = this.shell(id, 'frame', this.nodeLayer, `${model.name}, ${short(model.tech)}`);
    div('name frame-name', node, model.name);
    div('down-note', node, 'не работает');
    div('stack', node);
    return { id, type: 'frame', node, geom: layout => (layout.frames[id] ? { ...layout.frames[id] } : null) };
  }

  buildEdges() {
    const all = new Map();
    for (const [variant, layout] of Object.entries(LAYOUTS)) {
      for (const [id, spec] of Object.entries(layout.edges)) {
        if (!all.has(id)) all.set(id, { spec, variants: new Set() });
        all.get(id).variants.add(variant);
      }
    }
    for (const [id, { spec, variants }] of all) {
      const model = EDGE[id];
      const topics = topicsOf(model);
      const d = rounded(spec.points, 12);
      const route = svg('path', { d, class: 'route' }, this.routeLayer);
      const g = svg('g', { class: `edge ${model.kind}`, 'data-edge': id }, this.lineLayer);
      svg('path', { d, class: 'line', 'marker-end': 'url(#arrow-line)' }, g);
      svg('path', { d, class: 'hit' }, g);
      this.edges.set(id, { id, g, route, model, spec, variants, topics });
      this.tracks.set(id, sample(spec.points, 12));
      if (spec.label) this.labels.set(id, this.edgeLabel(id, spec.label, model));
    }
    for (const [variant, layout] of Object.entries(LAYOUTS)) {
      if (layout.shared) this.labels.set(`shared-${variant}`, this.edgeLabel(`shared-${variant}`, layout.shared, null));
      for (const [key, spec] of Object.entries(layout.inner)) {
        if (this.inner.has(key)) {
          this.inner.get(key).variants.add(variant);
          continue;
        }
        const g = svg('g', { class: 'edge inner', 'data-inner': key }, this.lineLayer);
        svg('path', { d: rounded(spec.points), class: 'line', 'marker-end': 'url(#arrow-line)' }, g);
        this.inner.set(key, { g, spec, variants: new Set([variant]) });
      }
    }
  }

  edgeLabel(id, spec, model) {
    const g = svg('g', { class: 'edge-label', 'data-label': id }, this.labelLayer);
    g.dataset.kind = model ? model.kind : 'sync';
    if (spec.branch) g.dataset.branch = 'true';
    const plate = svg('rect', { class: 'label-plate', rx: 7 }, g);
    const texts = spec.lines.map((line, index) => svg('text', {
      x: spec.x,
      y: spec.y + index * 14,
      class: line.startsWith('[') ? 'label-tech' : 'label-text',
      'text-anchor': spec.anchor || 'start'
    }, g, line));
    if (spec.under) texts.push(svg('text', { x: spec.under.x, y: spec.under.y, class: 'label-tech', 'text-anchor': 'middle' }, g, spec.under.text));
    return { g, plate, texts, branch: Boolean(spec.branch), shared: spec.edges || null };
  }

  measure() {
    for (const label of this.labels.values()) {
      let area = null;
      for (const text of label.texts) {
        const box = text.getBBox();
        if (!box.width) continue;
        area = area ? { x: Math.min(area.x, box.x), y: Math.min(area.y, box.y), r: Math.max(area.r, box.x + box.width), b: Math.max(area.b, box.y + box.height) } : { x: box.x, y: box.y, r: box.x + box.width, b: box.y + box.height };
      }
      if (area) {
        for (const [name, value] of Object.entries({ x: area.x - 7, y: area.y - 3, width: area.r - area.x + 14, height: area.b - area.y + 6 })) label.plate.setAttribute(name, String(round(value)));
      }
    }
  }

  applyLayout() {
    for (const item of this.items.values()) {
      const geom = item.geom(this.layout);
      const node = item.node;
      if (geom) {
        item.last = geom;
        if (item.type !== 'kafka') Object.assign(node.style, { left: `${geom.x}px`, top: `${geom.y}px`, width: `${geom.w}px`, height: `${geom.h}px` });
        node.classList.toggle('chip', Boolean(geom.chip));
      }
      const hidden = !geom || geom.o === 0;
      node.classList.toggle('absent', hidden);
      node.tabIndex = hidden ? -1 : 0;
    }
  }

  setVariant(name, animate = true) {
    if (!LAYOUTS[name] || name === this.variant) return;
    this.variant = name;
    this.layout = LAYOUTS[name];
    this.world.dataset.variant = name;
    this.clearParticles();
    this.clearParked();
    if (this.selected && !this.renders(this.selected)) this.select(null, { camera: false });
    this.world.classList.toggle('morphing', animate && !calm.matches);
    clearTimeout(this.morphTimer);
    this.morphTimer = setTimeout(() => this.world.classList.remove('morphing'), 1100);
    this.applyLayout();
    this.paintVisibility();
    this.paint();
  }

  paintVisibility() {
    const variant = this.variant;
    for (const edge of this.edges.values()) {
      const absent = !edge.variants.has(variant);
      edge.g.classList.toggle('absent', absent);
      edge.route.classList.toggle('absent', absent);
    }
    for (const inner of this.inner.values()) inner.g.classList.toggle('absent', !inner.variants.has(variant));
    for (const [id, label] of this.labels) {
      const present = id.startsWith('shared-') ? id === `shared-${variant}` : this.edges.get(id).variants.has(variant);
      label.g.classList.toggle('absent', !present);
    }
    for (const [topic, lane] of this.lanes) lane.classList.toggle('absent', !this.layout.lanes.includes(topic));
  }

  renders(id) {
    if (this.edges.has(id)) return this.edges.get(id).variants.has(this.variant);
    const item = this.items.get(id);
    if (!item) return false;
    const geom = item.geom(this.layout);
    return Boolean(geom) && geom.o !== 0;
  }

  bind() {
    const host = this.host;
    let press = null;
    host.addEventListener('pointerdown', event => {
      if (event.button > 0) return;
      press = { x: event.clientX, y: event.clientY, view: { ...this.view }, moved: false, id: event.pointerId };
    });
    host.addEventListener('pointermove', event => {
      if (press && press.id === event.pointerId) {
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) > 5 && this.zoomed()) {
          press.moved = true;
          host.setPointerCapture(event.pointerId);
          host.classList.add('dragging');
        }
        if (press.moved) {
          const scale = this.view.w / host.clientWidth;
          this.setView(this.clamp({ ...press.view, x: press.view.x - dx * scale, y: press.view.y - dy * scale }), false);
          return;
        }
      }
      this.hover(event);
    });
    const release = event => {
      if (!press || press.id !== event.pointerId) return;
      const moved = press.moved;
      press = null;
      host.classList.remove('dragging');
      if (moved || event.type === 'pointercancel') return;
      const node = event.target.closest('[data-node]');
      if (node && !node.classList.contains('absent')) this.activate(node.dataset.node);
      else if (!event.target.closest('.zoom, .sheet')) this.select(null);
    };
    host.addEventListener('pointerup', release);
    host.addEventListener('pointercancel', release);
    host.addEventListener('pointerleave', () => {
      this.hoverEdge(null);
      if (this.preview) {
        this.preview = null;
        if (!this.selected) this.paint();
      }
    });
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        this.select(null);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const node = event.target.closest('[data-node]');
      if (!node) return;
      event.preventDefault();
      this.activate(node.dataset.node);
    });
    host.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX, event.clientY);
    }, { passive: false });
    new ResizeObserver(() => {
      if (this.selected) this.focus(this.selected, false);
      else this.setView(this.fullView(), false);
    }).observe(host);
  }

  activate(id) {
    const target = this.resolve(id);
    if (this.hooks.onActivate && this.hooks.onActivate(target, id) === false) return;
    this.select(target === this.selected ? null : target);
  }

  resolve(id) {
    if (this.items.get(id)?.type === 'card' && this.variant !== 'domain') return this.layout.container[id];
    return id;
  }

  hover(event) {
    const hit = event.target.closest('.edge .hit');
    this.hoverEdge(hit ? hit.parentNode.dataset.edge : null);
    const node = event.target.closest('[data-node]');
    const id = node && !node.classList.contains('absent') ? this.resolve(node.dataset.node) : null;
    if (id === this.preview) return;
    this.preview = id;
    if (!this.selected) this.paint();
  }

  hoverEdge(id) {
    if (id === this.hoveredEdge) return;
    if (this.hoveredEdge) {
      this.labels.get(this.hoveredEdge)?.g.classList.remove('hover');
      this.edges.get(this.hoveredEdge)?.g.classList.remove('hover');
    }
    this.hoveredEdge = id;
    if (id) {
      this.labels.get(id)?.g.classList.add('hover');
      this.edges.get(id)?.g.classList.add('hover');
    }
  }

  related(id) {
    const edges = new Set();
    const nodes = new Set([id]);
    const present = Array.from(this.edges.values()).filter(edge => edge.variants.has(this.variant));
    for (const edge of present) {
      const { from, to } = edge.model;
      if (from !== id && to !== id) continue;
      edges.add(edge.id);
      nodes.add(from === id ? to : from);
      if (edge.model.kind !== 'async') continue;
      for (const other of present) {
        if (other === edge || other.model.kind !== 'async' || !other.topics.some(topic => edge.topics.includes(topic))) continue;
        if ((edge.model.to === 'kafka' && other.model.from === 'kafka') || (edge.model.from === 'kafka' && other.model.to === 'kafka')) {
          edges.add(other.id);
          nodes.add(other.model.from === 'kafka' ? other.model.to : other.model.from);
        }
      }
    }
    for (const [key, inner] of this.inner) {
      if (inner.variants.has(this.variant) && this.layout.container[inner.spec.from] === id) edges.add(key);
    }
    return { edges, nodes };
  }

  paint() {
    const target = this.selected || this.preview;
    this.world.classList.toggle('focus', Boolean(target));
    this.world.querySelectorAll('.on, .near').forEach(node => node.classList.remove('on', 'near'));
    if (!target) return;
    const { edges, nodes } = this.related(target);
    for (const id of nodes) {
      const item = this.items.get(id);
      if (item) item.node.classList.add(id === target ? 'on' : 'near');
      if (FRAME_IDS.includes(id)) {
        for (const domain of DOMAINS) {
          if (this.layout.container[domain] === id) this.items.get(domain).node.classList.add(id === target ? 'on' : 'near');
        }
      }
    }
    for (const id of edges) {
      this.edges.get(id)?.g.classList.add('on');
      this.inner.get(id)?.g.classList.add('on');
      const label = this.labels.get(id);
      if (label && !label.branch) label.g.classList.add('on');
    }
    const shared = this.labels.get(`shared-${this.variant}`);
    if (shared && shared.shared.some(id => edges.has(id))) shared.g.classList.add('near');
  }

  select(id, { camera = true } = {}) {
    const next = id && this.renders(id) ? id : null;
    this.selected = next;
    this.paint();
    if (camera) {
      if (next) this.focus(next);
      else this.fitAll();
    }
    if (this.hooks.onSelect) this.hooks.onSelect(next);
  }

  setInset(px) {
    this.inset = px;
  }

  fullView() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return { ...VIEW };
    const aspect = width / height;
    if (aspect > VIEW.w / VIEW.h) {
      const w = VIEW.h * aspect;
      return { x: VIEW.x - (w - VIEW.w) / 2, y: VIEW.y, w, h: VIEW.h };
    }
    const h = VIEW.w / aspect;
    return { x: VIEW.x, y: VIEW.y - (h - VIEW.h) / 2, w: VIEW.w, h };
  }

  zoomed() {
    return this.view.w < this.fullView().w - 1;
  }

  focus(id, animate = true) {
    const geom = this.items.get(id)?.geom(this.layout);
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!geom || !width) return;
    const full = this.fullView();
    if (geom.w > VIEW.w / 2) {
      this.setView(full, animate);
      return;
    }
    const pad = 40;
    const usable = Math.max(width * 0.45, width - this.inset);
    const base = width / full.w;
    const scale = Math.max(base, Math.min(base * MAX_ZOOM, usable / Math.max(FOCUS_SPAN, geom.w + pad * 2), height / (geom.h + pad * 2)));
    const w = width / scale;
    const h = height / scale;
    const cx = geom.x + geom.w / 2;
    const cy = geom.y + geom.h / 2;
    this.setView(this.clamp({ x: cx - usable / 2 / scale, y: cy - h / 2, w, h }, this.inset / scale), animate);
  }

  fitAll(animate = true) {
    this.setView(this.fullView(), animate);
  }

  fitBeside(animate = true) {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const usable = width - this.inset;
    if (!width || usable < width * 0.45) {
      this.fitAll(animate);
      return;
    }
    const scale = Math.min(usable / (VIEW.w + 40), height / (VIEW.h + 40));
    const w = width / scale;
    const h = height / scale;
    this.setView({ x: VIEW.x + VIEW.w / 2 - usable / 2 / scale, y: VIEW.y + VIEW.h / 2 - h / 2, w, h }, animate);
  }

  clamp(view, extra = 0) {
    const full = this.fullView();
    const margin = 60;
    return {
      ...view,
      x: Math.max(full.x - margin - extra, Math.min(full.x + full.w - view.w + margin + extra, view.x)),
      y: Math.max(full.y - margin, Math.min(full.y + full.h - view.h + margin, view.y))
    };
  }

  zoomAt(factor, clientX, clientY) {
    const box = this.host.getBoundingClientRect();
    const full = this.fullView();
    const w = Math.max(full.w / MAX_ZOOM, Math.min(full.w, this.view.w / factor));
    const h = w * full.h / full.w;
    const px = clientX === undefined ? 0.5 : (clientX - box.left) / box.width;
    const py = clientY === undefined ? 0.5 : (clientY - box.top) / box.height;
    const x = this.view.x + (this.view.w - w) * px;
    const y = this.view.y + (this.view.h - h) * py;
    this.setView(w >= full.w - 0.5 ? full : this.clamp({ x, y, w, h }), true);
  }

  setView(view, animate = true) {
    this.view = view;
    const scale = this.host.clientWidth / view.w || 1;
    this.world.classList.toggle('gliding', animate && !calm.matches);
    this.world.style.transform = `translate(${round(-view.x * scale)}px, ${round(-view.y * scale)}px) scale(${round(scale * 10000) / 10000})`;
    const zoomed = this.zoomed();
    this.host.classList.toggle('zoomed', zoomed);
    if (this.hooks.onView) this.hooks.onView(zoomed);
  }

  setFilter(value) {
    this.world.dataset.filter = value;
  }

  setLabels(on) {
    this.world.classList.toggle('labels', on);
  }

  setDown(ids) {
    this.down = new Set(ids);
    for (const item of this.items.values()) item.node.classList.toggle('down', this.down.has(item.id));
    for (const domain of DOMAINS) {
      const container = this.layout.container[domain];
      const node = this.items.get(domain).node;
      node.classList.toggle('down', this.down.has(domain) || this.down.has(container));
      node.classList.toggle('inside-down', container !== domain && this.down.has(container));
    }
  }

  setStacks(stacks) {
    this.stacks = new Map(Object.entries(stacks));
    for (const item of this.items.values()) {
      if (item.type !== 'card' && item.type !== 'frame') continue;
      const count = this.stacks.get(item.id) || 1;
      item.node.dataset.stack = String(Math.min(count, 3));
      item.node.querySelector('.stack').textContent = count > 1 ? `×${count}` : '';
    }
  }

  setBadges(list) {
    const wanted = new Map(list.map(entry => [entry.id, entry]));
    for (const [id, slot] of this.badges) {
      const entry = wanted.get(id);
      const owner = this.items.get(id)?.node;
      if (!entry) {
        slot.classList.add('empty');
        owner?.classList.remove('badged');
        continue;
      }
      const changed = slot.textContent !== entry.text;
      slot.textContent = entry.text;
      slot.dataset.tone = entry.tone || '';
      slot.classList.remove('empty');
      owner?.classList.add('badged');
      if (changed && !calm.matches) slot.animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'ease-out' });
    }
  }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    const done = () => {
      if (this.hooks.onRevealed) this.hooks.onRevealed();
    };
    if (calm.matches) {
      done();
      return;
    }
    const span = 1300;
    for (const item of this.items.values()) {
      if (item.node.classList.contains('absent')) continue;
      const geom = item.geom(this.layout);
      const delay = (geom.y / VIEW.h) * span;
      item.node.animate([{ opacity: 0, transform: 'translateY(14px) scale(.97)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 700, delay, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
    }
    for (const edge of this.edges.values()) {
      if (!edge.variants.has(this.variant)) continue;
      const delay = (edge.spec.points[0][1] / VIEW.h) * span + 250;
      const mask = svg('mask', { id: `draw-${edge.id}`, maskUnits: 'userSpaceOnUse', x: VIEW.x, y: VIEW.y, width: VIEW.w, height: VIEW.h }, this.edgeLayer);
      const pen = svg('path', { d: edge.g.querySelector('.line').getAttribute('d'), pathLength: 1, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-dasharray': '1 1' }, mask);
      edge.g.setAttribute('mask', `url(#${mask.id})`);
      const animation = pen.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay, easing: 'cubic-bezier(.45, .05, .3, 1)', fill: 'backwards' });
      animation.onfinish = () => {
        edge.g.removeAttribute('mask');
        mask.remove();
      };
    }
    setTimeout(done, span + 600);
  }

  live({ edges = [], past = [], index = 0, animate = false } = {}) {
    this.world.querySelectorAll('.live, .past').forEach(node => node.classList.remove('live', 'past'));
    this.world.classList.toggle('playing', edges.length > 0 || past.length > 0);
    this.clearParticles();
    for (const id of past) this.edges.get(id)?.route.classList.add('past');
    const ends = new Set();
    for (const id of edges) {
      const model = EDGE[id];
      ends.add(model.from);
      ends.add(model.to);
      const edge = this.edges.get(id);
      if (!edge) continue;
      edge.g.classList.add('live');
      edge.route.classList.add('live');
      this.labels.get(id)?.g.classList.add('live');
    }
    for (const id of ends) this.items.get(id)?.node.classList.add('live');
    this.placeStep(edges[0], index);
    if (!animate || calm.matches) return;
    let delay = 0;
    let producer = null;
    for (const id of edges) {
      const model = EDGE[id];
      let track;
      if (model.to === 'kafka') {
        producer = model.from;
        track = sample(this.publishPoints(model.from, TOPIC_OF[model.from]));
      } else if (model.from === 'kafka') {
        const source = producer || (model.to === 'order' ? 'payment' : 'order');
        const topic = TOPIC_OF[source];
        track = sample(join(this.lanePoints(topic, this.publishX(source), this.consumeX(model.to)), this.consumePoints(model.to, topic)));
      } else {
        track = this.tracks.get(id);
      }
      if (!track) continue;
      const duration = Math.max(380, Math.min(780, track.length * 2.2));
      this.travel({ track, tone: 'mark', kind: model.kind === 'async' ? 'event' : 'sync', duration, delay, edges: [id], arrive: model.to === 'kafka' ? null : model.to });
      delay += duration * 0.82;
    }
  }

  mark(ids, on) {
    for (const id of ids) {
      const edge = this.edges.get(id);
      if (!edge) continue;
      edge.route.classList.toggle('guide', on);
      edge.g.classList.toggle('guided', on);
      for (const end of [edge.model.from, edge.model.to]) this.items.get(end)?.node.classList.toggle('guided', on);
    }
  }

  placeStep(id, index) {
    const track = id && this.tracks.get(id);
    if (!track || !index) {
      this.stepMark.classList.add('empty');
      return;
    }
    const [x, y, angle] = pointAt(track, track.length * 0.5);
    this.stepMark.setAttribute('transform', `translate(${round(x - Math.sin(angle) * 16)} ${round(y + Math.cos(angle) * 16)})`);
    this.stepText.textContent = String(index);
    this.stepMark.classList.remove('empty');
  }

  publishX(container) {
    const edge = this.asyncEdge(container, 'kafka');
    return edge ? edge.spec.points[0][0] : null;
  }

  consumeX(container) {
    const edge = this.asyncEdge('kafka', container);
    return edge ? edge.spec.points[0][0] : null;
  }

  asyncEdge(from, to) {
    for (const edge of this.edges.values()) {
      if (edge.variants.has(this.variant) && edge.model.kind === 'async' && edge.model.from === from && edge.model.to === to) return edge;
    }
    return null;
  }

  edgeBetween(from, to) {
    for (const edge of this.edges.values()) {
      if (edge.variants.has(this.variant) && edge.model.from === from && edge.model.to === to) return edge;
    }
    return null;
  }

  publishPoints(container, topic) {
    const [[x, y0], [, y1]] = this.asyncEdge(container, 'kafka').spec.points;
    return [[x, y0], [x, y1], [x, laneY(topic)]];
  }

  lanePoints(topic, x0, x1) {
    return [[x0, laneY(topic)], [x1, laneY(topic)]];
  }

  consumePoints(container, topic) {
    const [[x, y0], [, y1]] = this.asyncEdge('kafka', container).spec.points;
    return [[x, laneY(topic)], [x, y0], [x, y1]];
  }

  innerPoints(from, to) {
    for (const inner of this.inner.values()) {
      if (!inner.variants.has(this.variant)) continue;
      if (inner.spec.from === from && inner.spec.to === to) return inner.spec.points;
      if (inner.spec.from === to && inner.spec.to === from) return [...inner.spec.points].reverse();
    }
    const a = this.layout.cards[from];
    const b = this.layout.cards[to];
    const ax = a.x + a.w / 2;
    const bx = b.x + b.w / 2;
    const y = a.y + a.h;
    const frame = this.layout.frames[this.layout.container[from]];
    const dip = frame ? Math.min(18, frame.y + frame.h - y - 6) : 12;
    const points = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      points.push([ax + (bx - ax) * t, y + 2 + Math.sin(Math.PI * t) * dip]);
    }
    return points;
  }

  trackOf(id) {
    return this.tracks.get(id);
  }

  travel({ track, tone = 'ink', kind = 'sync', duration, delay = 0, edges = [], arrive = null, onDone = null, trail = false }) {
    if (calm.matches) {
      if (onDone) setTimeout(onDone, delay + (duration || 600));
      return null;
    }
    const paint = tone === 'fail' || tone === 'mark' ? tone : 'ink';
    const g = svg('g', { class: `particle ${kind} p-${paint}` }, this.particleLayer);
    g.style.opacity = '0';
    if (kind === 'event') {
      svg('circle', { r: 9, class: 'halo' }, g);
      svg('rect', { x: -3.8, y: -3.8, width: 7.6, height: 7.6, rx: 1.8, transform: 'rotate(45)', class: 'core' }, g);
    } else if (kind === 'store') {
      svg('circle', { r: 4.5, class: 'halo' }, g);
      svg('circle', { r: 2, class: 'core' }, g);
    } else {
      svg('rect', { x: -30, y: -1.3, width: 30, height: 2.6, rx: 1.3, class: 'tail', fill: `url(#tail-${paint})` }, g);
      svg('circle', { r: 8, class: 'halo' }, g);
      svg('circle', { r: 2.8, class: 'core' }, g);
    }
    let path = null;
    if (trail) path = svg('path', { d: 'M' + track.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' L'), class: `trail p-${paint}` }, this.trailLayer);
    const particle = { g, track, kind, tone: paint, start: performance.now() + delay, duration: duration || track.length * 2, edges, arrive, onDone, path, heated: false };
    this.particles.add(particle);
    this.kick();
    return particle;
  }

  warm(ids, delta) {
    for (const id of ids) {
      const value = Math.max(0, (this.warmth.get(id) || 0) + delta);
      this.warmth.set(id, value);
      this.edges.get(id)?.g.classList.toggle('hot', value > 0);
    }
  }

  clearParticles() {
    for (const particle of this.particles) {
      particle.g.remove();
      if (particle.path) particle.path.remove();
      if (particle.heated) this.warm(particle.edges, -1);
    }
    this.particles.clear();
  }

  pulse(id) {
    const node = this.items.get(id)?.node;
    if (!node || calm.matches) return;
    node.classList.remove('ping');
    void node.offsetWidth;
    node.classList.add('ping');
  }

  ring(x, y, tone) {
    if (calm.matches) return;
    const g = svg('g', { transform: `translate(${round(x)} ${round(y)})`, class: `ring p-${tone}` }, this.ringLayer);
    const circle = svg('circle', { r: 4 }, g);
    circle.animate([{ transform: 'scale(1)', opacity: 0.8 }, { transform: 'scale(4.5)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => g.remove();
  }

  burst(x, y) {
    if (calm.matches) return;
    const g = svg('g', { transform: `translate(${round(x)} ${round(y)})`, class: 'burst' }, this.ringLayer);
    const circle = svg('circle', { r: 5 }, g);
    const cross = svg('path', { d: 'M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5' }, g);
    circle.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3.6)', opacity: 0 }], { duration: 650, easing: 'ease-out' });
    cross.animate([{ opacity: 1, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' }).onfinish = () => g.remove();
  }

  park(key, x, y, tone, count) {
    let group = this.parked.get(key);
    if (!count) {
      if (group) group.remove();
      this.parked.delete(key);
      return;
    }
    if (!group) {
      group = svg('g', { class: 'parked' }, this.particleLayer);
      this.parked.set(key, group);
    }
    const shown = Math.min(count, 8);
    while (group.children.length < shown) svg('rect', { x: -3.5, y: -3.5, width: 7, height: 7, rx: 1.6, class: 'core' }, group);
    while (group.children.length > shown) group.lastChild.remove();
    Array.from(group.children).forEach((rect, index) => rect.setAttribute('transform', `translate(${round(x - index * 11)} ${round(y)}) rotate(45)`));
  }

  clearParked() {
    for (const group of this.parked.values()) group.remove();
    this.parked.clear();
  }

  kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame(now) {
    this.raf = 0;
    let busy = false;
    for (const particle of this.particles) {
      const t = (now - particle.start) / particle.duration;
      if (t < 0) {
        busy = true;
        continue;
      }
      if (!particle.heated) {
        particle.heated = true;
        this.warm(particle.edges, 1);
      }
      if (t >= 1) {
        this.particles.delete(particle);
        particle.g.remove();
        if (particle.path) particle.path.remove();
        this.warm(particle.edges, -1);
        const [x, y] = pointAt(particle.track, particle.track.length);
        if (particle.arrive) {
          this.pulse(particle.arrive);
          this.ring(x, y, particle.tone);
        }
        if (particle.onDone) particle.onDone(x, y);
        continue;
      }
      const [x, y, angle] = pointAt(particle.track, glide(t) * particle.track.length);
      particle.g.style.opacity = String(Math.min(1, t * 8, (1 - t) * 10));
      particle.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(angle * 180 / Math.PI).toFixed(1)})`);
      busy = true;
    }
    if (busy) this.kick();
  }
}
