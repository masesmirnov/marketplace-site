import { ICON, element } from './code.js';

const STEP_MS = 1400;
const PRICE = 750;
const COUNT = 2;
const TOTAL = PRICE * COUNT;
const FEE = TOTAL / 10;
const rub = value => value.toLocaleString('ru-RU') + ' ₽';

const ORDER = 't0';
const PAY = 't1';
const EVENT = 't2';
const USER = 't3';

function checkout() {
  return [
    {
      tone: USER,
      edges: ['buyer-storefront', 'storefront-gateway', 'gateway-order', 'order-orderDb'],
      who: 'покупатель',
      say: 'оформляет заказ, order-service пишет его в свою базу',
      apply: world => world.order.push('создан')
    },
    {
      tone: ORDER,
      edges: ['order-catalog', 'catalog-catalogDb'],
      who: 'order-service',
      say: `резервирует ${COUNT} шт. в каталоге`,
      apply: world => {
        world.stock.free -= COUNT;
        world.stock.reserved += COUNT;
      }
    },
    {
      tone: PAY,
      edges: ['order-payment', 'payment-psp', 'payment-paymentDb'],
      who: 'payment-service',
      say: `создаёт платёж у провайдера на ${rub(TOTAL)}`,
      apply: world => {
        world.payment.status = 'ждёт оплаты';
      }
    }
  ];
}

function buyer(say, edges = ['buyer-psp']) {
  return { tone: USER, edges, who: 'покупатель', say };
}

function webhook(say, apply) {
  return { tone: PAY, edges: ['psp-payment', 'payment-paymentDb'], who: 'payment-service', say, apply };
}

function paymentEvent(event) {
  return {
    tone: EVENT,
    edges: ['payment-kafka', 'kafka-order'],
    who: 'payment-service',
    say: `публикует ${event}`,
    apply: world => world.events.push(event)
  };
}

function paid() {
  return webhook('получает вебхук «оплачено», пишет проводки', world => {
    world.payment.status = 'оплачен';
    world.payment.entries.push(['комиссия', FEE], ['продавцу', TOTAL - FEE]);
  });
}

function confirm() {
  return {
    tone: ORDER,
    edges: ['order-orderDb', 'order-kafka'],
    who: 'order-service',
    say: 'ставит «оплачен», публикует order.status_changed',
    apply: world => {
      world.order.push('оплачен');
      world.events.push('order.status_changed');
    }
  };
}

function cancel(say) {
  return { tone: ORDER, edges: ['order-orderDb'], who: 'order-service', say, apply: world => world.order.push('отменён') };
}

function release() {
  return {
    tone: ORDER,
    edges: ['order-catalog', 'catalog-catalogDb'],
    who: 'order-service',
    say: `снимает резерв: ${COUNT} шт. снова в продаже`,
    apply: world => {
      world.stock.free += COUNT;
      world.stock.reserved -= COUNT;
    }
  };
}

function publish() {
  return {
    tone: EVENT,
    edges: ['order-kafka'],
    who: 'order-service',
    say: 'публикует order.status_changed',
    apply: world => world.events.push('order.status_changed')
  };
}

function notify(text) {
  return {
    tone: EVENT,
    edges: ['kafka-notification', 'notification-notificationDb', 'notification-mailers'],
    who: 'notification-service',
    say: `отправляет письмо «${text}»`,
    apply: world => world.mail.push(text)
  };
}

const SCENARIOS = {
  paid: {
    title: 'оплата прошла',
    steps: [
      ...checkout(),
      buyer('платит на странице провайдера'),
      paid(),
      paymentEvent('payment.succeeded'),
      confirm(),
      notify('Заказ оплачен'),
      {
        tone: EVENT,
        edges: ['kafka-feed', 'feed-feedStore'],
        who: 'feed-service',
        say: 'учитывает покупку в интересах',
        apply: world => {
          world.feed = 'Посуда: интерес +1';
        }
      }
    ],
    verdict: 'Заказ оплачен, письмо ушло, лента учла покупку'
  },
  declined: {
    title: 'банк отклонил оплату',
    steps: [
      ...checkout(),
      buyer('пробует оплатить, банк отклоняет карту'),
      webhook('получает вебхук «отклонено»', world => {
        world.payment.status = 'отклонён';
      }),
      paymentEvent('payment.failed'),
      cancel('отменяет заказ'),
      release(),
      publish(),
      notify('Оплата не прошла, заказ отменён')
    ],
    verdict: 'Оплата не прошла: заказ отменён, резерв снят'
  },
  timeout: {
    title: 'покупатель не заплатил',
    steps: [
      ...checkout(),
      cancel('15 минут без оплаты: отменяет заказ'),
      release(),
      publish(),
      notify('Заказ отменён: оплата не поступила')
    ],
    verdict: 'Оплаты нет 15 минут: заказ отменён, резерв снят'
  },
  refund: {
    title: 'отмена после оплаты',
    steps: [
      ...checkout(),
      buyer('платит на странице провайдера'),
      paid(),
      paymentEvent('payment.succeeded'),
      confirm(),
      buyer('отменяет оплаченный заказ', ['buyer-storefront', 'storefront-gateway', 'gateway-order']),
      {
        tone: PAY,
        edges: ['order-payment', 'payment-psp', 'payment-paymentDb'],
        who: 'payment-service',
        say: `оформляет возврат ${rub(TOTAL)}`,
        apply: world => {
          world.payment.status = 'ждёт возврата';
        }
      },
      webhook('получает вебхук «возврат проведён», сторнирует проводки', world => {
        world.payment.status = 'возвращён';
        world.payment.entries.push(['сторно комиссии', -FEE], ['сторно продавцу', -(TOTAL - FEE)]);
      }),
      paymentEvent('payment.refunded'),
      cancel('отменяет заказ'),
      release(),
      publish(),
      notify('Деньги вернутся на карту')
    ],
    verdict: 'Деньги вернулись, проводки сторнированы, товар снова в продаже'
  }
};

function freshWorld() {
  return { order: [], stock: { free: 5, reserved: 0 }, payment: { status: '—', entries: [] }, events: [], mail: [], feed: null };
}

function card(title, ...children) {
  const node = element('div', 'state-card');
  node.append(element('div', 'state-title', title), ...children);
  return node;
}

function chips(items, className, seen, prefix) {
  const row = element('div', 'chips');
  if (!items.length) row.append(element('span', 'empty', 'пусто'));
  items.forEach((text, index) => {
    const chip = element('span', className);
    chip.textContent = text;
    const key = `${prefix}:${index}:${text}`;
    if (seen && !seen.has(key)) chip.classList.add('fresh');
    row.append(chip);
  });
  return row;
}

export class SagaLab {
  constructor(parts, map, emit) {
    this.parts = parts;
    this.map = map;
    this.emit = emit;
    this.scenario = 'paid';
    this.speed = 1;
    this.speedTimer = 0;
    this.playing = false;
    this.finished = false;
    this.active = false;
    this.now = 0;
    this.steps = 0;
    this.seen = null;
    this.built = null;
    this.build();
    this.seek(0);
    let last = performance.now();
    const frame = now => {
      this.tick(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  get spec() {
    return SCENARIOS[this.scenario];
  }

  build() {
    this.picker = element('div', 'picker');
    this.pickerButton = element('button', 'chip-button picker-button', `<span></span>${ICON('chevron')}`);
    this.pickerButton.type = 'button';
    this.pickerButton.setAttribute('aria-haspopup', 'listbox');
    this.pickerButton.setAttribute('aria-expanded', 'false');
    this.pickerButton.setAttribute('aria-label', 'Сценарий');
    this.pickerList = element('div', 'picker-list');
    this.pickerList.setAttribute('role', 'listbox');
    this.pickerList.hidden = true;
    this.options = Object.entries(SCENARIOS).map(([id, scenario]) => {
      const option = element('button', 'picker-option', `${ICON('check')}<span></span>`);
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.dataset.scenario = id;
      option.querySelector('span').textContent = scenario.title;
      return option;
    });
    this.pickerList.append(...this.options);
    this.picker.append(this.pickerButton, this.pickerList);
    this.showScenario();
    this.playButton = element('button', 'chip-button play-button primary');
    this.playButton.type = 'button';
    this.stepButton = element('button', 'chip-button', `${ICON('step')}<span>Шаг</span>`);
    this.stepButton.type = 'button';
    this.resetButton = element('button', 'icon-button', ICON('reset'));
    this.resetButton.type = 'button';
    this.resetButton.setAttribute('aria-label', 'Заново');
    this.resetButton.title = 'Заново';
    this.speedBox = element('label', 'speed');
    this.speedBox.title = 'Скорость прогона';
    this.speedInput = element('input');
    Object.assign(this.speedInput, { type: 'range', min: '0', max: '1', step: '0.01', value: '1' });
    this.speedInput.setAttribute('aria-label', 'Скорость прогона');
    this.speedValue = element('output', '', '×1');
    this.speedBox.append(element('span', '', 'скорость'), this.speedInput, this.speedValue);
    this.counter = element('span', 'counter');
    this.counter.setAttribute('aria-live', 'polite');
    this.parts.tools.append(this.picker, this.speedBox, this.playButton, this.stepButton, this.resetButton, this.counter);

    this.playButton.addEventListener('click', () => this.control(this.playing ? 'pause' : 'play'));
    this.stepButton.addEventListener('click', () => this.control('step'));
    this.resetButton.addEventListener('click', () => this.control('reset'));
    this.pickerButton.addEventListener('click', () => this.openPicker(this.pickerList.hidden));
    this.pickerList.addEventListener('click', event => {
      const option = event.target.closest('[data-scenario]');
      if (!option) return;
      this.openPicker(false);
      this.pickerButton.focus();
      this.control('reset', option.dataset.scenario);
    });
    this.picker.addEventListener('keydown', event => this.pickerKey(event));
    document.addEventListener('pointerdown', event => {
      if (!this.picker.contains(event.target)) this.openPicker(false);
    });
    this.speedInput.addEventListener('input', () => {
      this.showSpeed(Number(this.speedInput.value));
      if (!this.speedTimer) this.speedTimer = setTimeout(() => this.shareSpeed(), 150);
    });
    this.speedInput.addEventListener('change', () => this.shareSpeed());
    this.parts.steps.addEventListener('click', event => {
      const row = event.target.closest('[data-step]');
      if (row) this.jump(Number(row.dataset.step));
    });
  }

  openPicker(open) {
    this.pickerList.hidden = !open;
    this.pickerButton.setAttribute('aria-expanded', String(open));
    if (open) this.options.find(option => option.dataset.scenario === this.scenario).focus();
  }

  pickerKey(event) {
    if (event.key === 'Tab') this.openPicker(false);
    if (event.key === 'Escape' && !this.pickerList.hidden) {
      this.openPicker(false);
      this.pickerButton.focus();
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (this.pickerList.hidden) {
      this.openPicker(true);
      return;
    }
    const index = this.options.indexOf(document.activeElement);
    this.options[(index + (event.key === 'ArrowDown' ? 1 : -1) + this.options.length) % this.options.length].focus();
  }

  showScenario() {
    this.pickerButton.firstChild.textContent = this.spec.title;
    for (const option of this.options) option.setAttribute('aria-selected', String(option.dataset.scenario === this.scenario));
  }

  total() {
    return this.spec.steps.length;
  }

  control(mode, scenario = this.scenario) {
    const restart = mode === 'reset' || scenario !== this.scenario || (this.finished && mode !== 'pause');
    const at = restart ? 0 : Math.floor(this.now * 1000) / 1000;
    const state = {
      t: 'lab',
      lab: 'saga',
      mode,
      scenario,
      seed: 1,
      at: mode === 'play' ? Math.max(at, Math.floor(at) + 0.999) : at,
      speed: this.speed
    };
    this.applyState(state);
    this.emit(state);
  }

  jump(steps) {
    const state = { t: 'lab', lab: 'saga', mode: 'pause', scenario: this.scenario, seed: 1, at: steps, speed: this.speed };
    this.applyState(state);
    if (this.active && steps) this.render(true);
    this.emit(state);
  }

  showSpeed(speed) {
    this.speed = Math.max(0, Math.min(1, Math.round(speed * 100) / 100));
    this.speedInput.value = String(this.speed);
    this.speedValue.textContent = `×${this.speed}`;
  }

  shareSpeed() {
    clearTimeout(this.speedTimer);
    this.speedTimer = 0;
    const mode = this.playing ? 'play' : 'pause';
    this.emit({ t: 'lab', lab: 'saga', mode, scenario: this.scenario, seed: 1, at: Math.floor(this.now * 1000) / 1000, speed: this.speed });
  }

  applyState(state, elapsed = 0) {
    this.scenario = Object.hasOwn(SCENARIOS, state.scenario) ? state.scenario : 'paid';
    this.showScenario();
    this.showSpeed(typeof state.speed === 'number' ? state.speed : 1);
    if (state.mode === 'step') {
      const target = Math.floor(state.at) + 1;
      if (!this.finished && this.steps === target - 1) this.advance();
      else this.seek(target);
      return;
    }
    this.seek(state.mode === 'play' ? state.at + elapsed * this.speed / STEP_MS : state.at);
    if (state.mode === 'play' && !this.finished) {
      this.playing = true;
      this.updateButtons();
    }
  }

  restore(state, now) {
    if (state) this.applyState(state, Math.max(0, now - state.stamp));
    else this.applyState({ mode: 'reset', scenario: 'paid', at: 0, speed: 1 });
  }

  show() {
    this.active = true;
    this.render(false);
  }

  hide() {
    this.active = false;
    this.map.live({});
    this.map.setBadges([]);
  }

  seek(at) {
    this.playing = false;
    this.finished = false;
    this.steps = Math.min(this.total(), Math.floor(Math.max(0, at)));
    this.now = Math.min(Math.max(0, at), this.steps + 0.999);
    this.seen = null;
    this.render(false);
    if (this.steps >= this.total()) this.finish();
    else this.hideVerdict();
    this.updateButtons();
  }

  advance() {
    this.playing = false;
    this.steps = Math.min(this.total(), this.steps + 1);
    this.now = this.steps;
    this.render(true);
    if (this.steps >= this.total()) this.finish();
    this.updateButtons();
  }

  tick(ms) {
    if (!this.playing) return;
    this.now += ms * this.speed / STEP_MS;
    let moved = false;
    while (this.steps < Math.floor(this.now) && this.steps < this.total()) {
      this.steps += 1;
      moved = true;
    }
    if (moved) this.render(true);
    if (this.steps >= this.total()) this.finish();
  }

  world() {
    const world = freshWorld();
    for (const step of this.spec.steps.slice(0, this.steps)) {
      if (step.apply) step.apply(world);
    }
    return world;
  }

  hideVerdict() {
    this.parts.verdict.className = 'verdict';
    this.parts.verdict.replaceChildren();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    this.parts.verdict.className = 'verdict shown';
    this.parts.verdict.innerHTML = `${ICON('check')}<span></span>`;
    this.parts.verdict.querySelector('span').textContent = this.spec.verdict;
    this.updateButtons();
  }

  updateButtons() {
    const label = this.playing ? 'Пауза' : this.finished ? 'Ещё раз' : this.steps > 0 ? 'Дальше' : 'Запустить';
    this.playButton.innerHTML = `${ICON(this.playing ? 'pause' : 'play')}<span>${label}</span>`;
  }

  render(animate) {
    const step = this.steps ? this.spec.steps[this.steps - 1] : null;
    const world = this.world();
    if (this.active) {
      const past = this.spec.steps.slice(0, Math.max(0, this.steps - 1)).flatMap(item => item.edges);
      this.map.live(step ? { edges: step.edges, past, index: this.steps, animate } : {});
      this.map.setBadges(this.badges(world));
    }
    this.counter.textContent = `шаг ${this.steps} из ${this.total()}`;
    this.renderSteps();
    this.renderState(world);
  }

  badges(world) {
    const list = [];
    if (world.order.length) list.push({ id: 'order', text: world.order[world.order.length - 1], tone: ORDER });
    if (world.stock.reserved) list.push({ id: 'catalog', text: `резерв ${world.stock.reserved} шт.`, tone: ORDER });
    if (world.payment.status !== '—') list.push({ id: 'payment', text: world.payment.status, tone: PAY });
    if (world.events.length) list.push({ id: 'kafka', text: world.events[world.events.length - 1], tone: EVENT });
    if (world.mail.length) list.push({ id: 'mailers', text: 'письмо ушло', tone: USER });
    if (world.feed) list.push({ id: 'feed', text: 'посуда +1', tone: EVENT });
    return list;
  }

  renderSteps() {
    const holder = this.parts.steps;
    if (this.built !== this.scenario) {
      this.built = this.scenario;
      holder.replaceChildren(...this.spec.steps.map((step, index) => {
        const row = element('li', `step ${step.tone}`);
        row.dataset.step = String(index + 1);
        row.append(element('span', 'n', String(index + 1)));
        const text = element('span', 'text');
        text.append(element('span', 'who', step.who), document.createTextNode(' ' + step.say));
        row.append(text);
        return row;
      }));
    }
    Array.from(holder.children).forEach((row, index) => {
      row.classList.toggle('done', index < this.steps - 1);
      row.classList.toggle('now', index === this.steps - 1);
    });
    const current = holder.children[this.steps - 1];
    if (current && this.active) {
      const top = current.offsetTop - holder.offsetTop;
      if (top < holder.scrollTop || top + current.offsetHeight > holder.scrollTop + holder.clientHeight) holder.scrollTo({ top: Math.max(0, top - 40), behavior: 'smooth' });
    }
  }

  renderState(world) {
    const keys = new Set();
    const track = (items, prefix) => items.forEach((text, index) => keys.add(`${prefix}:${index}:${text}`));
    const status = world.order.length ? world.order[world.order.length - 1] : '—';
    const orderCard = card('Заказ, order-service',
      element('div', 'state-value', status),
      chips(world.order, 'step-chip', this.seen, 'order'));
    track(world.order, 'order');
    const stock = card('Остатки, catalog-service',
      element('div', 'state-value', `${world.stock.free} в продаже`),
      element('div', 'state-note', world.stock.reserved ? `${world.stock.reserved} в резерве` : 'резерва нет'));
    const entries = world.payment.entries.map(([name, value]) => `${name}: ${value < 0 ? '−' : ''}${rub(Math.abs(value))}`);
    const payment = card('Платёж, payment-service',
      element('div', 'state-value', world.payment.status),
      chips(entries, 'entry-chip', this.seen, 'entry'));
    track(entries, 'entry');
    const events = card('События в Kafka', chips(world.events, 'event-chip', this.seen, 'event'));
    track(world.events, 'event');
    const mails = world.mail.map(text => `письмо: ${text}`);
    const feed = world.feed ? [world.feed] : [];
    const effects = card('Уведомления и лента', chips([...mails, ...feed], 'mail-chip', this.seen, 'mail'));
    effects.classList.add('wide');
    track([...mails, ...feed], 'mail');
    this.parts.state.replaceChildren(orderCard, stock, payment, events, effects);
    this.seen = keys;
  }
}
