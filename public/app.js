import { startBoard, toast } from './board.js';
import { element, highlight } from './code.js';
import { createDiagram } from './diagram.js';
import { mountHealth } from './health.js';
import { mark, markVerdicts, mountSketches } from './ink.js';
import { EDGES, NODES, VARIANTS, VARIANT_ORDER } from './model.js';
import { setupNavigation, setupTheme } from './page.js';
import { SagaLab } from './saga.js';
import { SKETCHES } from './sketches.js';

const PYTHON = {
  keywords: new Set(['from', 'import', 'def', 'return', 'class', 'async', 'await']),
  builtins: new Set(),
  definers: new Set(['def', 'class'])
};

const CODE_TAGS = {
  3: 'приложение',
  6: 'единственный маршрут',
  8: 'FastAPI отвечает 200'
};

const CHOICE = {
  domain: ['Выбран.', 'Ленте нужны своё хранилище и отдельное масштабирование, платежи изолированы, уведомления не тормозят продажи. Цена — сага из двух шагов, outbox и идемпотентные обработчики.'],
  coarse: ['Не выбран.', '«Коммерция» держит вместе каталог и платежи с разными релизами и требованиями безопасности, а во «Вовлечении» всплеск рассылок мешает выдаче ленты.'],
  monolith: ['Не выбран.', 'Лучше подходит небольшой команде и первой версии, но лента масштабируется только вместе со всем приложением, а платёжные данные лежат в общей базе.']
};

function title(id) {
  return NODES[id].service || NODES[id].name;
}

function item(parts) {
  const node = element('li');
  for (const part of parts) {
    if (part && typeof part === 'object') {
      const code = element('code');
      code.textContent = part.code;
      node.append(code);
    } else {
      node.append(document.createTextNode(part));
    }
  }
  return node;
}

function renderDetails(holder, id, present) {
  holder.replaceChildren();
  if (!id) {
    const hint = element('p', 'empty-hint');
    hint.textContent = 'Нажмите на любой контейнер на схеме: здесь появятся его домен, данные, которыми он владеет, синхронные вызовы и события. Повторное нажатие снимает выделение.';
    holder.append(hint);
    return;
  }
  const model = NODES[id];
  const head = element('div', 'details-head');
  const name = element('h3');
  name.textContent = model.name;
  head.append(name);
  if (model.service) {
    const code = element('code');
    code.textContent = model.service;
    head.append(code);
  }
  const kind = element('span', 'kind');
  kind.textContent = `[${model.tech}]`;
  head.append(kind);

  const edges = EDGES.filter(edge => present.has(edge.id));
  const rows = [];
  const add = (label, items) => {
    if (items.length) rows.push([label, items]);
  };
  const store = edges.find(edge => edge.from === id && edge.kind === 'store');
  const owner = edges.find(edge => edge.to === id && edge.kind === 'store');
  const syncOut = edges.filter(edge => edge.from === id && edge.kind === 'sync');
  const syncIn = edges.filter(edge => edge.to === id && edge.kind === 'sync');
  const publishes = edges.filter(edge => edge.from === id && edge.kind === 'async');
  const reads = edges.filter(edge => edge.to === id && edge.kind === 'async');

  if (model.domain) add('Домен', [[model.domain]]);
  if (!model.domain && !owner && model.desc.length) add('Что это', [[model.desc.join(' ')]]);
  if (model.owns) {
    const owned = model.owns.map(value => [value]);
    if (store) owned.push([`всё это — в «${NODES[store.to].name}» [${NODES[store.to].tech.replace('Container: ', '')}]`]);
    add('Владеет данными', owned);
  }
  if (owner) {
    add('Чьё хранилище', [[{ code: title(owner.from) }, ' — обращается только он, общих баз нет']]);
    add('Что хранит', [[model.desc.join(' ')]]);
  }
  if (model.does) add('Отвечает за', model.does.map(value => [value]));
  if (id === 'kafka') {
    add('Публикуют', edges.filter(edge => edge.to === 'kafka').map(edge => [{ code: title(edge.from) }, ' — ', { code: edge.topics }]));
    add('Читают', edges.filter(edge => edge.from === 'kafka').map(edge => [{ code: title(edge.to) }, ' — ', { code: edge.topics }]));
  }
  add('Вызывает', syncOut.map(edge => [{ code: title(edge.to) }, ` — ${edge.label} [${edge.tech}]`]));
  add('Его вызывают', syncIn.map(edge => [{ code: title(edge.from) }, ` — ${edge.label} [${edge.tech}]`]));
  if (id !== 'kafka') {
    add('Публикует', publishes.map(edge => [{ code: edge.topics }, ' в Kafka']));
    add('Читает', reads.map(edge => [{ code: edge.topics }, ' из Kafka']));
  }
  if (model.why) add('Почему отдельно', [[model.why]]);

  const facts = element('dl', 'facts');
  for (const [label, items] of rows) {
    const term = element('dt');
    term.textContent = label;
    const value = element('dd');
    const list = element('ul');
    items.forEach(parts => list.append(item(parts)));
    value.append(list);
    facts.append(term, value);
  }
  holder.append(head, facts);
}

class Variants {
  constructor(diagram, emit) {
    this.diagram = diagram;
    this.emit = emit;
    this.switcher = document.getElementById('variant-switch');
    this.buttons = VARIANT_ORDER.map(id => {
      const button = element('button', VARIANTS[id].chosen ? 'chosen' : '');
      button.type = 'button';
      button.textContent = VARIANTS[id].title;
      button.addEventListener('click', () => this.choose(id));
      this.switcher.append(button);
      return [id, button];
    });
    this.apply('domain');
  }

  choose(id) {
    this.apply(id);
    this.emit({ t: 'lab', lab: 'variants', mode: 'pause', scenario: id, seed: 1, at: 0, speed: 1 });
  }

  apply(id) {
    const variant = Object.hasOwn(VARIANTS, id) ? id : 'domain';
    this.diagram.setVariant(variant);
    for (const [key, button] of this.buttons) button.setAttribute('aria-pressed', String(key === variant));
    const spec = VARIANTS[variant];
    document.getElementById('variant-short').textContent = spec.short;
    const fill = (target, values) => document.getElementById(target).replaceChildren(...values.map(value => {
      const node = element('li');
      node.textContent = value;
      return node;
    }));
    fill('variant-pros', spec.pros);
    fill('variant-cons', spec.cons);
    const [verdict, reason] = CHOICE[variant];
    const choice = document.getElementById('variant-choice');
    choice.replaceChildren(element('b'), document.createTextNode(' ' + reason));
    choice.firstChild.textContent = verdict;
  }
}

async function loadCode() {
  const holder = document.getElementById('catalog-code');
  try {
    const response = await fetch('catalog/main.py');
    const lines = (await response.text()).replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    const pre = element('pre', 'code');
    lines.forEach((text, index) => {
      const row = element('span', 'ln', `<span class="no">${index + 1}</span><span class="src">${highlight(text, PYTHON) || ' '}</span>`);
      const tag = CODE_TAGS[index + 1];
      if (tag) {
        const note = element('span', 'tag');
        note.textContent = tag;
        row.append(note);
      }
      pre.append(row);
    });
    holder.replaceChildren(pre);
  } catch {
    toast('Не удалось загрузить main.py');
  }
}

setupTheme();
setupNavigation();
loadCode();

let board = null;
const share = state => board && board.send(state);

const details = document.getElementById('details');
let present = new Set();
const c4 = createDiagram(document.getElementById('c4'), {
  title: 'Диаграмма контейнеров маркетплейса',
  onSelect: id => renderDetails(details, id, present)
});
present = new Set(Array.from(c4.svg.querySelectorAll('.edge'), edge => edge.dataset.edge));
renderDetails(details, null, present);

const filters = Array.from(document.querySelectorAll('#filter button'));
for (const button of filters) {
  button.addEventListener('click', () => {
    c4.setFilter(button.dataset.filter);
    filters.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
}

const saga = new SagaLab(document.getElementById('saga-lab'), createDiagram(document.getElementById('saga-diagram'), { title: 'Схема, по которой идёт заказ' }), share);
const variants = new Variants(createDiagram(document.getElementById('variants-diagram'), { variants: VARIANT_ORDER, variant: 'domain', title: 'Три варианта разбиения' }), share);
mountHealth(document.getElementById('health'));

board = startBoard({
  lab: state => (state.lab === 'saga' ? saga.applyState(state) : variants.apply(state.scenario)),
  restore: data => {
    const labs = data.labs || {};
    saga.restore(labs.saga || null, data.now);
    variants.apply(labs.variants ? labs.variants.scenario : 'domain');
  }
});

mountSketches(SKETCHES, {
  top: 'market-hero',
  diagram: 'blocks',
  saga: 'receipt',
  variants: 'fork',
  service: 'pulse',
  'board-section': 'pencil'
});
mark(document.querySelector('h1 .mark'), 'underline', 700);
markVerdicts();
