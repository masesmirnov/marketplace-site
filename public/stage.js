import { ICON, element } from './code.js';
import { Codebook } from './codebook.js';
import { DOMAINS, LAYOUTS } from './layout.js';
import { ICONS, LiveMap, storeIcons } from './map.js';
import { COMPARISON, EDGES, NODES, VARIANTS, VARIANT_ORDER } from './model.js';
import { SagaLab } from './saga.js';
import { Traffic } from './traffic.js';

const MODES = ['overview', 'saga', 'whatif', 'variants', 'code'];
const HASHES = { '#scheme': 'overview', '#saga': 'saga', '#whatif': 'whatif', '#variants': 'variants', '#code': 'code' };
const SHEET_INSET = 372;
const wide = matchMedia('(min-width: 901px)');
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const CHOICE = {
  domain: ['Выбран.', 'Лента масштабируется отдельно, платежи изолированы. Цена — сага и outbox.'],
  coarse: ['Не выбран.', 'Каталог и платежи живут вместе, рассылки мешают ленте.'],
  monolith: ['Не выбран.', 'Хорош для первой версии, но лента и платежи делят процесс и базу.']
};

const EXPERIMENTS = {
  load: {
    label: 'Наплыв покупателей',
    outcome: {
      domain: 'Растут только лента и каталог.',
      coarse: 'Растут «Вовлечение» и вся «Коммерция».',
      monolith: 'Растёт всё приложение целиком.'
    }
  }
};

const SCALED = { domain: ['feed', 'catalog'], coarse: ['engagement', 'commerce'], monolith: ['monolith'] };

const ACTIONS = {
  buyer: [
    { id: 'feed', label: 'Открыть ленту', hint: 'чтение', note: 'Лента собрана заранее и читается из Redis.' },
    { id: 'card', label: 'Открыть карточку', hint: 'чтение', note: 'Карточка читается из базы каталога.' },
    { id: 'login', label: 'Войти', hint: 'JWT', note: 'Пароль проверяет user-service, токен потом проверяет шлюз.' },
    { id: 'checkout', label: 'Оформить заказ', hint: 'сага', note: 'Синхронно резерв и платёж, дальше события через Kafka.' }
  ],
  seller: [
    { id: 'edit', label: 'Изменить цену', hint: 'запись', note: 'Каталог сохраняет цену и шлёт product.* в ленту.' }
  ]
};

const LEGEND = [
  ['', 'синхронный вызов'],
  ['async', 'событие через Kafka'],
  ['dot', 'запрос'],
  ['accent', 'ваш запрос']
];

const CAPABILITIES = [
  {
    name: 'Лента',
    check: down => {
      if (down.has('feed')) return ['broken', 'Не открывается, остальное работает.'];
      if (down.has('catalog')) return ['ok', 'Работает на своей копии карточек.'];
      if (down.has('kafka')) return ['slow', 'Работает, новинки подтянет позже.'];
      return ['ok', 'Читается из своего Redis.'];
    }
  },
  {
    name: 'Каталог и карточки',
    check: down => (down.has('catalog')
      ? ['broken', 'Карточки не открываются.']
      : ['ok', 'Своя база, свой сервис.'])
  },
  {
    name: 'Вход',
    check: (down, layout) => {
      if (down.has('user')) return layout.nodes.gateway ? ['slow', 'Новые входы не проходят, сессии живут.'] : ['broken', 'Не работает.'];
      return ['ok', 'JWT проверяет шлюз.'];
    }
  },
  {
    name: 'Заказ и оплата',
    check: down => {
      if (down.has('order')) return ['broken', 'Нельзя оформить, оплаты ждут в Kafka.'];
      if (down.has('catalog')) return ['broken', 'Нельзя: нет цен и резерва.'];
      if (down.has('payment')) return ['broken', 'Нельзя: платёж создаётся синхронно.'];
      if (down.has('kafka')) return ['slow', 'Оформляется, статус придёт позже.'];
      return ['ok', 'Сага проходит целиком.'];
    }
  },
  {
    name: 'Уведомления',
    check: (down, layout) => {
      if (down.has('notification')) return layout.nodes.kafka ? ['slow', 'Задерживаются, события ждут в Kafka.'] : ['broken', 'Не работают.'];
      if (down.has('kafka')) return ['slow', 'Задерживаются, события ждут в outbox.'];
      return ['ok', 'Не тормозят заказ.'];
    }
  }
];

const STATUS_ICON = { ok: 'check', broken: 'x', slow: 'pulse' };
const MARKS = { good: 'check', part: 'minus', bad: 'x' };

export class Stage {
  constructor(root, share) {
    this.root = root;
    this.share = share;
    this.mode = 'overview';
    this.variant = 'domain';
    this.filter = 'all';
    this.labels = false;
    this.trafficOn = true;
    this.visible = false;
    this.revealed = false;
    this.down = new Set();
    this.experiments = { load: false };
    this.load = 1;
    this.guiding = null;
    this.guideEdges = new Set();
    this.run = 0;
    this.shared = '';
    this.viewport = root.querySelector('#viewport');
    this.sheet = root.querySelector('#sheet');
    this.caption = root.querySelector('#map-caption');
    this.captionTimer = 0;
    this.map = new LiveMap(root.querySelector('#map-host'), {
      onSelect: id => this.renderSheet(id),
      onActivate: id => this.activate(id),
      onPick: () => this.publish(),
      onView: zoomed => this.viewport.classList.toggle('zoomed', zoomed),
      onRevealed: () => {
        this.revealed = true;
        this.syncTraffic();
      }
    });
    this.traffic = new Traffic(this.map, { onChange: waiting => this.renderWaiting(waiting) });
    this.buildFeet();
    this.saga = new SagaLab({
      tools: root.querySelector('#saga-tools'),
      steps: this.sagaParts.steps,
      state: this.sagaParts.state,
      verdict: this.sagaParts.verdict
    }, this.map, share);
    this.codebook = new Codebook(root.querySelector('#codebook'), () => this.publish());
    this.bindTools();
    this.applyVariant('domain');
    this.updateInset();
    wide.addEventListener('change', () => this.updateInset());
    new IntersectionObserver(entries => {
      this.visible = entries.some(entry => entry.isIntersecting);
      if (this.visible) this.map.reveal();
      this.syncTraffic();
    }, { threshold: 0.35 }).observe(this.viewport);
    document.addEventListener('visibilitychange', () => this.syncTraffic());
    window.addEventListener('hashchange', () => this.follow(true));
    this.follow();
  }

  follow(share = false) {
    const mode = HASHES[location.hash];
    if (!mode) return;
    this.setMode(mode);
    if (share) this.publish();
    requestAnimationFrame(() => this.root.scrollIntoView({ block: 'start' }));
  }

  updateInset() {
    this.map.setInset(wide.matches ? SHEET_INSET : 0);
  }

  bindTools() {
    this.tabs = Array.from(this.root.querySelectorAll('.tabs [data-mode]'));
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        this.setMode(tab.dataset.mode);
        this.publish();
      });
    }
    this.root.querySelector('.tabs').addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const index = MODES.indexOf(this.mode) + (event.key === 'ArrowRight' ? 1 : -1);
      const next = MODES[(index + MODES.length) % MODES.length];
      this.setMode(next);
      this.publish();
      this.tabs.find(tab => tab.dataset.mode === next).focus();
    });

    this.filters = Array.from(this.root.querySelectorAll('#filter [data-filter]'));
    for (const button of this.filters) {
      button.addEventListener('click', () => {
        this.setFilter(button.dataset.filter);
        this.publish();
      });
    }
    this.setFilter('all');
    this.labelsToggle = this.root.querySelector('#labels-toggle');
    this.labelsToggle.addEventListener('click', () => {
      this.setLabels(!this.labels);
      this.publish();
    });
    this.trafficToggle = this.root.querySelector('#traffic-toggle');
    this.trafficToggle.addEventListener('click', () => {
      this.setTraffic(!this.trafficOn);
      this.publish();
    });

    this.loadInput = this.root.querySelector('#load');
    this.loadValue = this.root.querySelector('#load-value');
    this.loadInput.addEventListener('input', () => {
      this.setLoad(Number(this.loadInput.value));
      this.publish();
    });
    this.root.querySelector('#revive').addEventListener('click', () => {
      this.down.clear();
      this.applyDown();
      this.publish();
    });

    this.variantButtons = VARIANT_ORDER.map(id => {
      const button = element('button', VARIANTS[id].chosen ? 'chosen' : '');
      button.type = 'button';
      button.textContent = VARIANTS[id].title;
      button.addEventListener('click', () => this.chooseVariant(id));
      this.root.querySelector('#variant-switch').append(button);
      return [id, button];
    });

    for (const button of this.root.querySelectorAll('[data-zoom]')) {
      button.addEventListener('click', () => this.map.zoomAt(button.dataset.zoom === 'in' ? 1.35 : 1 / 1.35));
    }
  }

  buildFeet() {
    const overview = this.root.querySelector('#foot-overview');
    const legend = element('ul', 'legend');
    for (const [kind, text] of LEGEND) {
      const item = element('li');
      item.append(element('i', kind), document.createTextNode(text));
      legend.append(item);
    }
    overview.append(legend);

    const saga = this.root.querySelector('#foot-saga');
    const layout = element('div', 'saga-foot');
    this.sagaParts = {
      steps: element('ol', 'steps'),
      state: element('div', 'state'),
      verdict: element('div', 'verdict')
    };
    this.sagaParts.verdict.setAttribute('role', 'status');
    layout.append(this.sagaParts.steps, this.sagaParts.state, this.sagaParts.verdict);
    saga.append(layout);

    const whatif = this.root.querySelector('#foot-whatif');
    const note = element('div', 'whatif-note');
    const text = element('p', 'foot-note');
    text.textContent = 'Нажмите на сервис или Kafka, чтобы уронить, и ещё раз, чтобы поднять.';
    this.waitingLine = element('p', 'foot-note waiting');
    note.append(text, this.waitingLine);
    this.capabilities = element('div', 'caps');
    whatif.append(note, this.capabilities);
    this.renderCapabilities();

    const variants = this.root.querySelector('#foot-variants');
    const head = element('div', 'variant-head');
    const heading = element('div');
    this.variantTitle = element('p', 'foot-title');
    this.variantShort = element('p', 'foot-note');
    heading.append(this.variantTitle, this.variantShort);
    const experiments = element('div', 'experiments');
    this.experimentButtons = Object.entries(EXPERIMENTS).map(([id, spec]) => {
      const button = element('button', 'chip-button');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `${ICON('pulse')}<span></span>`;
      button.querySelector('span').textContent = spec.label;
      button.addEventListener('click', () => {
        this.experiments[id] = !this.experiments[id];
        button.setAttribute('aria-pressed', String(this.experiments[id]));
        this.applyExperiments();
        this.publish();
      });
      experiments.append(button);
      return [id, button];
    });
    head.append(heading, experiments);
    const tip = element('p', 'foot-note', 'Нажмите на сервис, чтобы уронить, и ещё раз, чтобы поднять.');
    this.variantCaps = element('div', 'caps compact');
    this.outcome = element('p', 'outcome');
    this.outcome.setAttribute('aria-live', 'polite');
    this.compare = this.buildCompare();
    this.choice = element('p', 'choice');
    variants.append(head, tip, this.variantCaps, this.outcome, this.compare, this.choice);
  }

  buildCompare() {
    const table = element('table', 'compare');
    const head = table.createTHead().insertRow();
    head.append(element('th'));
    for (const id of VARIANT_ORDER) {
      const cell = element('th');
      cell.dataset.variant = id;
      cell.textContent = VARIANTS[id].title;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of COMPARISON) {
      const line = body.insertRow();
      const name = element('th');
      name.scope = 'row';
      name.textContent = row.name;
      line.append(name);
      for (const id of VARIANT_ORDER) {
        const [mark, note] = row[id];
        const cell = element('td', mark, ICON(MARKS[mark]));
        cell.dataset.variant = id;
        const text = element('span');
        text.textContent = note;
        cell.append(text);
        line.append(cell);
      }
    }
    return table;
  }

  setMode(mode) {
    if (!MODES.includes(mode) || mode === this.mode) return;
    const previous = this.mode;
    if (previous === 'saga') this.saga.hide();
    if (previous === 'whatif') {
      this.down.clear();
      this.load = 1;
      this.loadInput.value = '1';
      this.loadValue.textContent = '×1';
    }
    if (previous === 'variants') {
      this.down.clear();
      this.experiments = { load: false };
      for (const [, button] of this.experimentButtons) button.setAttribute('aria-pressed', 'false');
    }
    this.mode = mode;
    this.root.dataset.mode = mode;
    for (const tab of this.tabs) {
      const selected = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    this.endGuide();
    clearTimeout(this.captionTimer);
    this.caption.classList.remove('shown');
    this.map.select(null);
    this.map.setDown([]);
    this.map.setStacks({});
    this.map.setBadges([]);
    this.traffic.reset();
    this.traffic.setDown([]);
    this.traffic.setLoad(1);
    this.map.setVariant(mode === 'variants' ? this.variant : 'domain');
    if (mode === 'saga') this.saga.show();
    if (mode === 'whatif') {
      this.applyDown();
      this.hint('Нажмите на сервис или на Kafka, чтобы уронить');
    }
    if (mode === 'variants') {
      this.applyDown();
      this.applyExperiments();
      this.hint('Нажмите на сервис, чтобы уронить');
    }
    this.syncTraffic();
  }

  syncTraffic() {
    const allowed = this.mode === 'overview' ? this.trafficOn : this.mode === 'whatif' || this.mode === 'variants';
    if (allowed && this.revealed && this.visible && document.visibilityState === 'visible' && !calm.matches) this.traffic.start();
    else this.traffic.stop();
  }

  setFilter(filter) {
    this.filter = filter;
    this.map.setFilter(filter);
    for (const button of this.filters) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  }

  setLabels(on) {
    this.labels = on;
    this.labelsToggle.setAttribute('aria-pressed', String(on));
    this.map.setLabels(on);
  }

  setTraffic(on) {
    this.trafficOn = on;
    this.trafficToggle.setAttribute('aria-pressed', String(on));
    this.syncTraffic();
  }

  setLoad(load) {
    this.load = load;
    this.loadInput.value = String(load);
    this.loadValue.textContent = `×${load}`;
    this.applyLoad();
  }

  activate(id) {
    if (this.mode === 'saga') return false;
    if (this.mode === 'whatif' || this.mode === 'variants') {
      if (!this.droppable(id)) return false;
      if (this.down.has(id)) this.down.delete(id);
      else this.down.add(id);
      this.applyDown();
      const name = id === 'kafka' ? 'Kafka' : NODES[id].domain?.toLowerCase() || NODES[id].name;
      this.hint(this.down.has(id) ? `Уронили: ${name}` : `Подняли: ${name}`);
      return false;
    }
    if (this.mode === 'overview' && ACTIONS[id]) {
      if (this.map.selected === id) {
        this.map.select(null);
      } else {
        this.map.select(id, { camera: false });
        this.map.fitBeside();
      }
      return false;
    }
    return true;
  }

  openCode(path) {
    this.setMode('code');
    this.codebook.open(path);
  }

  guide(action) {
    if (this.guiding || calm.matches) return;
    this.guiding = action.id;
    this.renderSheet(this.map.selected);
    this.hint(action.label);
    const note = this.sheet.querySelector('.guide-note');
    if (note) note.textContent = action.note;
    this.traffic.guide(action.id, {
      slow: 1.8,
      onHop: edges => {
        for (const id of edges) this.guideEdges.add(id);
        this.map.mark(edges, true);
      }
    }).then(() => {
      setTimeout(() => this.endGuide(), action.id === 'checkout' || action.id === 'edit' ? 4200 : 1600);
    });
  }

  endGuide() {
    this.map.mark(Array.from(this.guideEdges), false);
    this.guideEdges.clear();
    if (!this.guiding) return;
    this.guiding = null;
    this.sheet.querySelectorAll('.action.running').forEach(button => button.classList.remove('running'));
  }

  applyDown() {
    const ids = Array.from(this.down);
    this.map.setDown(ids);
    this.traffic.setDown(ids);
    this.renderCapabilities();
  }

  applyLoad() {
    const stacks = {};
    for (const id of SCALED.domain) stacks[id] = this.load;
    this.map.setStacks(this.load > 1 ? stacks : {});
    this.traffic.setLoad(this.load);
  }

  droppable(id) {
    const layout = LAYOUTS[this.map.variant];
    return id === 'kafka' ? Boolean(layout.nodes.kafka) : Object.values(layout.container).includes(id);
  }

  renderCapabilities() {
    const layout = LAYOUTS[this.map.variant];
    const down = new Set(Array.from(this.down).flatMap(id => (id === 'kafka' ? [id] : DOMAINS.filter(domain => layout.container[domain] === id))));
    const compact = this.mode === 'variants';
    (compact ? this.variantCaps : this.capabilities).replaceChildren(...CAPABILITIES.map(capability => {
      const [state, text] = capability.check(down, layout);
      const box = element('div', `cap ${state}`);
      const head = element('div', 'cap-head');
      const status = element('span', 'status', ICON(STATUS_ICON[state]));
      const name = element('span');
      name.textContent = capability.name;
      head.append(status, name);
      box.append(head);
      if (compact) return box;
      const note = element('p');
      note.textContent = text;
      box.append(note);
      return box;
    }));
  }

  renderWaiting(waiting) {
    if (this.mode !== 'whatif' && this.mode !== 'variants') return;
    const badges = [];
    for (const [id, count] of Object.entries(waiting.queues)) {
      if (DOMAINS.includes(id) && count) badges.push({ id, text: `ждут ${count}`, tone: 'warn' });
    }
    for (const [id, count] of Object.entries(waiting.outbox)) {
      if (DOMAINS.includes(id) && count) badges.push({ id, text: `outbox ${count}`, tone: 'warn' });
    }
    this.map.setBadges(badges);
    if (this.waitingLine) this.waitingLine.textContent = waiting.total ? `Ждут доставки: ${waiting.total} ${this.plural(waiting.total)}` : '';
  }

  plural(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'событие';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'события';
    return 'событий';
  }

  chooseVariant(id) {
    this.applyVariant(id);
    this.share({ t: 'lab', lab: 'variants', mode: 'pause', scenario: id, seed: 1, at: 0, speed: 1 });
  }

  applyVariant(id) {
    const variant = Object.hasOwn(VARIANTS, id) ? id : 'domain';
    this.variant = variant;
    for (const [key, button] of this.variantButtons) button.setAttribute('aria-pressed', String(key === variant));
    const spec = VARIANTS[variant];
    this.variantTitle.textContent = spec.title;
    this.variantShort.textContent = spec.short;
    for (const cell of this.compare.querySelectorAll('[data-variant]')) cell.classList.toggle('current', cell.dataset.variant === variant);
    const [verdict, reason] = CHOICE[variant];
    this.choice.replaceChildren(element('b'), document.createTextNode(' ' + reason));
    this.choice.firstChild.textContent = verdict;
    if (this.mode === 'variants') {
      this.map.select(null);
      this.traffic.reset();
      this.map.setVariant(variant);
      this.down.clear();
      this.applyDown();
      this.applyExperiments();
    }
  }

  applyExperiments() {
    const stacks = {};
    if (this.experiments.load) for (const id of SCALED[this.variant]) stacks[id] = 3;
    this.map.setStacks(stacks);
    this.traffic.setLoad(this.experiments.load ? 3 : 1);
    const lines = Object.entries(this.experiments).filter(([, on]) => on).map(([id]) => EXPERIMENTS[id].outcome[this.variant]);
    this.outcome.replaceChildren(...lines.map((line, index) => {
      const node = element('span');
      node.textContent = (index ? ' ' : '') + line;
      return node;
    }));
  }

  hint(text) {
    clearTimeout(this.captionTimer);
    this.caption.textContent = text;
    this.caption.classList.add('shown');
    this.captionTimer = setTimeout(() => this.caption.classList.remove('shown'), 2600);
  }

  edgesNow() {
    return EDGES.filter(edge => this.map.edges.get(edge.id)?.variants.has(this.map.variant));
  }

  ref(id) {
    const button = element('button', 'ref');
    button.type = 'button';
    button.textContent = NODES[id].domain || NODES[id].name;
    button.addEventListener('click', () => {
      this.map.select(id);
      this.publish();
    });
    return button;
  }

  renderSheet(id) {
    if (!id) {
      this.sheet.classList.remove('shown');
      this.endGuide();
      return;
    }
    const model = NODES[id];
    const domain = DOMAINS.includes(id) ? id : null;
    const edges = this.edgesNow();
    const owner = edges.find(edge => edge.to === id && edge.kind === 'store');
    this.sheet.className = 'sheet shown';
    const head = element('div', 'sheet-head');
    const glyph = element('div', 'glyph', ICON(ICONS[id] || (model.kind === 'store' ? storeIcons(model.tech)[0] : id === 'kafka' ? 'stream' : 'store')));
    const name = element('h3');
    name.textContent = domain ? model.domain : model.name;
    const kind = element('div', 'kind');
    if (model.service) {
      const code = element('code');
      code.textContent = model.service;
      kind.append(code, document.createTextNode(' '));
    }
    kind.append(document.createTextNode(`[${model.tech}]`));
    const close = element('button', 'icon-button sheet-close', ICON('x'));
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.addEventListener('click', () => {
      this.map.select(null);
      this.publish();
    });
    head.append(glyph, name, close, kind);
    const nodes = [head];

    const zone = element('p', 'zone');
    zone.textContent = model.zone || model.desc.join(' ');
    nodes.push(zone);

    if (ACTIONS[id] && this.mode === 'overview') {
      const actions = element('div', 'actions');
      for (const action of ACTIONS[id]) {
        const button = element('button', `action${this.guiding === action.id ? ' running' : ''}`);
        button.type = 'button';
        button.append(document.createTextNode(action.label), element('span', '', action.hint));
        button.addEventListener('click', () => {
          button.classList.add('running');
          this.guide(action);
          this.publish(action.id);
        });
        actions.append(button);
      }
      actions.append(element('p', 'guide-note'));
      nodes.push(actions);
    }

    if (domain && this.mode === 'overview') {
      if (id === 'catalog') {
        const actions = element('div', 'actions');
        for (const [label, path] of [['main.py', 'services/catalog/main.py'], ['Dockerfile', 'services/catalog/Dockerfile'], ['docker-compose.yml', 'docker-compose.yml']]) {
          const button = element('button', 'action');
          button.type = 'button';
          button.append(document.createTextNode(label), element('span', '', 'открыть'));
          button.addEventListener('click', () => {
            this.openCode(path);
            this.publish();
          });
          actions.append(button);
        }
        nodes.push(actions);
      } else {
        nodes.push(element('p', 'sheet-note', 'Кода нет: по заданию поднят только catalog-service.'));
      }
    }

    const facts = element('dl', 'facts');
    const add = (label, items) => {
      if (!items.length) return;
      const term = element('dt');
      term.textContent = label;
      const value = element('dd', 'chips');
      value.append(...items);
      facts.append(term, value);
    };
    const chip = (text, mono = false) => {
      const node = element('span', mono ? 'chip mono' : 'chip');
      node.textContent = text;
      return node;
    };
    const unique = list => Array.from(new Set(list));
    const store = edges.find(edge => edge.from === id && edge.kind === 'store');
    if (model.owns) add('Данные', [...model.owns.map(value => chip(value)), ...(store ? [this.ref(store.to)] : [])]);
    if (owner) add('Чья база', [this.ref(owner.from)]);
    if (model.modules) add('Модули', model.modules.map(value => chip(value)));
    add('Вызывает', unique(edges.filter(edge => edge.from === id && edge.kind === 'sync').map(edge => edge.to)).map(target => this.ref(target)));
    add('Его вызывают', unique(edges.filter(edge => edge.to === id && edge.kind === 'sync').map(edge => edge.from)).map(source => this.ref(source)));
    if (id === 'kafka') {
      add('Публикуют', edges.filter(edge => edge.to === 'kafka').map(edge => this.ref(edge.from)));
      add('Читают', edges.filter(edge => edge.from === 'kafka').map(edge => this.ref(edge.to)));
    } else {
      add('Публикует', edges.filter(edge => edge.from === id && edge.kind === 'async').flatMap(edge => edge.topics.split(', ').map(value => chip(value, true))));
      add('Читает', edges.filter(edge => edge.to === id && edge.kind === 'async').flatMap(edge => edge.topics.split(', ').map(value => chip(value, true))));
    }
    if (facts.children.length) nodes.push(facts);
    if (model.why) nodes.push(element('p', 'why', model.why));
    this.sheet.replaceChildren(...nodes);
    this.sheet.scrollTop = 0;
  }

  snapshot() {
    return {
      t: 'view',
      mode: this.mode,
      filter: this.filter,
      labels: this.labels,
      traffic: this.trafficOn,
      selected: this.map.selected,
      down: Array.from(this.down),
      load: this.load,
      experiments: { load: this.experiments.load },
      file: this.codebook.current,
      run: this.run
    };
  }

  publish(guide = null) {
    if (guide) this.run += 1;
    const state = this.snapshot();
    const key = JSON.stringify(state);
    if (!guide && key === this.shared) return;
    this.shared = key;
    this.share({ ...state, guide });
  }

  view(state, replay = true) {
    this.setMode(state.mode);
    if (state.filter !== this.filter) this.setFilter(state.filter);
    if (state.labels !== this.labels) this.setLabels(state.labels);
    if (state.traffic !== this.trafficOn) this.setTraffic(state.traffic);
    if (this.mode === 'whatif' && state.load !== this.load) this.setLoad(state.load);
    if (this.mode === 'whatif' || this.mode === 'variants') {
      this.down = new Set(state.down.filter(id => this.droppable(id)));
      this.applyDown();
    }
    if (this.mode === 'variants' && state.experiments.load !== this.experiments.load) {
      this.experiments = { load: state.experiments.load };
      for (const [id, button] of this.experimentButtons) button.setAttribute('aria-pressed', String(this.experiments[id]));
      this.applyExperiments();
    }
    if (this.mode === 'code' && state.file !== this.codebook.current) this.codebook.open(state.file);
    if (state.selected !== this.map.selected) {
      if (this.mode === 'overview' && ACTIONS[state.selected]) {
        this.map.select(state.selected, { camera: false });
        this.map.fitBeside();
      } else {
        this.map.select(state.selected);
      }
    }
    const action = replay && state.run !== this.run && ACTIONS[this.map.selected]?.find(item => item.id === state.guide);
    this.run = state.run;
    if (action) this.guide(action);
    this.shared = JSON.stringify(this.snapshot());
  }

  restore(data) {
    const labs = data.labs || {};
    this.saga.restore(labs.saga || null, data.now);
    this.applyVariant(labs.variants ? labs.variants.scenario : 'domain');
    if (labs.view) this.view(labs.view, false);
  }

  lab(state) {
    if (state.lab === 'saga') this.saga.applyState(state);
    else this.applyVariant(state.scenario);
  }
}
