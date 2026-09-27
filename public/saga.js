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
      say: 'оформляет корзину: витрина → API Gateway → order-service, заказ записан в БД заказов',
      how: 'синхронно, HTTPS/JSON',
      apply: world => world.order.push('создан')
    },
    {
      tone: ORDER,
      edges: ['order-catalog', 'catalog-catalogDb'],
      who: 'order-service',
      say: `сверяет цену с каталогом и резервирует ${COUNT} шт.`,
      how: 'синхронно, HTTP/JSON',
      apply: world => {
        world.stock.free -= COUNT;
        world.stock.reserved += COUNT;
      }
    },
    {
      tone: PAY,
      edges: ['order-payment', 'payment-psp', 'payment-paymentDb'],
      who: 'payment-service',
      say: `по запросу order-service создаёт у провайдера платёж на ${rub(TOTAL)}, покупатель получает ссылку на оплату`,
      how: 'синхронно, HTTP/JSON и HTTPS',
      apply: world => {
        world.payment.status = 'ждёт оплаты';
      }
    }
  ];
}

function buyer(say, edges = ['buyer-psp'], how = 'синхронно, HTTPS') {
  return { tone: USER, edges, who: 'покупатель', say, how };
}

function webhook(say, apply) {
  return { tone: PAY, edges: ['psp-payment', 'payment-paymentDb'], who: 'payment-service', say, how: 'вебхук, HTTPS', apply };
}

function paymentEvent(event) {
  return {
    tone: EVENT,
    edges: ['payment-kafka', 'kafka-order'],
    who: 'payment-service',
    say: `публикует ${event}, order-service читает событие`,
    how: 'асинхронно, Kafka',
    apply: world => world.events.push(event)
  };
}

function paid() {
  return webhook('получает вебхук «оплата прошла», проверяет подпись провайдера и записывает проводки', world => {
    world.payment.status = 'оплачен';
    world.payment.entries.push(['комиссия', FEE], ['продавцу', TOTAL - FEE]);
  });
}

function confirm() {
  return {
    tone: ORDER,
    edges: ['order-orderDb', 'order-kafka'],
    who: 'order-service',
    say: 'переводит заказ в «оплачен» и публикует order.status_changed',
    how: 'асинхронно, Kafka',
    apply: world => {
      world.order.push('оплачен');
      world.events.push('order.status_changed');
    }
  };
}

function cancel(say) {
  return { tone: ORDER, edges: ['order-orderDb'], who: 'order-service', say, how: 'в своей БД', apply: world => world.order.push('отменён') };
}

function release() {
  return {
    tone: ORDER,
    edges: ['order-catalog', 'catalog-catalogDb'],
    who: 'order-service',
    say: `компенсация: снимает резерв, ${COUNT} шт. снова в продаже`,
    how: 'синхронно, HTTP/JSON',
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
    how: 'асинхронно, Kafka',
    apply: world => world.events.push('order.status_changed')
  };
}

function notify(text) {
  return {
    tone: EVENT,
    edges: ['kafka-notification', 'notification-notificationDb', 'notification-mailers'],
    who: 'notification-service',
    say: `читает order.status_changed и отправляет письмо «${text}»`,
    how: 'асинхронно, Kafka; письмо — HTTPS, SMTP',
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
        say: 'читает order.status_changed и повышает интерес покупателя к категории «Посуда»',
        how: 'асинхронно, Kafka',
        apply: world => {
          world.feed = 'Посуда: интерес +1';
        }
      }
    ],
    verdict: `Заказ оплачен: комиссия ${rub(FEE)}, продавцу ${rub(TOTAL - FEE)}, письмо ушло, лента учла покупку`
  },
  declined: {
    title: 'банк отклонил оплату',
    steps: [
      ...checkout(),
      buyer('пробует оплатить, банк отклоняет карту'),
      webhook('получает вебхук «оплата отклонена» и записывает отказ', world => {
        world.payment.status = 'отклонён';
      }),
      paymentEvent('payment.failed'),
      cancel('отменяет заказ'),
      release(),
      publish(),
      notify('Оплата не прошла, заказ отменён')
    ],
    verdict: 'Оплата не прошла: заказ отменён, резерв снят — это компенсация саги, покупатель предупреждён'
  },
  timeout: {
    title: 'покупатель не заплатил',
    steps: [
      ...checkout(),
      cancel('15 минут без оплаты: по таймеру отменяет заказ'),
      release(),
      publish(),
      notify('Заказ отменён: оплата не поступила')
    ],
    verdict: 'Оплата не пришла за 15 минут: order-service сам отменил заказ и снял резерв. Если деньги придут позже, он запросит возврат'
  },
  refund: {
    title: 'отмена после оплаты',
    steps: [
      ...checkout(),
      buyer('платит на странице провайдера'),
      paid(),
      paymentEvent('payment.succeeded'),
      confirm(),
      buyer('отменяет оплаченный заказ', ['buyer-storefront', 'storefront-gateway', 'gateway-order'], 'синхронно, HTTPS/JSON'),
      {
        tone: PAY,
        edges: ['order-payment', 'payment-psp', 'payment-paymentDb'],
        who: 'payment-service',
        say: `по запросу order-service оформляет у провайдера возврат ${rub(TOTAL)}`,
        how: 'синхронно, HTTP/JSON и HTTPS',
        apply: world => {
          world.payment.status = 'ждёт возврата';
        }
      },
      webhook('получает вебхук «возврат проведён» и сторнирует проводки', world => {
        world.payment.status = 'возвращён';
        world.payment.entries.push(['сторно комиссии', -FEE], ['сторно продавцу', -(TOTAL - FEE)]);
      }),
      paymentEvent('payment.refunded'),
      cancel('отменяет заказ'),
      release(),
      publish(),
      notify('Деньги вернутся на карту')
    ],
    verdict: 'Оплаченный заказ отменён: деньги вернулись, проводки сторнированы, товар снова в продаже'
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
  constructor(root, diagram, emit) {
    this.root = root;
    this.diagram = diagram;
    this.emit = emit;
    this.scenario = 'paid';
    this.speed = 1;
    this.speedTimer = 0;
    this.playing = false;
    this.finished = false;
    this.now = 0;
    this.steps = 0;
    this.seen = null;
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
    const head = this.root.querySelector('.lab-head');
    this.select = element('select');
    this.select.setAttribute('aria-label', 'Сценарий');
    for (const [id, scenario] of Object.entries(SCENARIOS)) {
      const option = element('option');
      option.value = id;
      option.textContent = scenario.title;
      this.select.append(option);
    }
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
    this.speedValue = element('output', '', '1.00');
    this.speedBox.append(this.speedInput, this.speedValue);
    head.append(this.select, this.speedBox, this.playButton, this.stepButton, this.resetButton);

    this.caption = this.root.querySelector('.caption');
    this.verdictBox = this.root.querySelector('.verdict');
    this.stateBox = this.root.querySelector('.state');

    this.playButton.addEventListener('click', () => this.control(this.playing ? 'pause' : 'play'));
    this.stepButton.addEventListener('click', () => this.control('step'));
    this.resetButton.addEventListener('click', () => this.control('reset'));
    this.select.addEventListener('change', () => this.control('reset', this.select.value));
    this.speedInput.addEventListener('input', () => {
      this.showSpeed(Number(this.speedInput.value));
      if (!this.speedTimer) this.speedTimer = setTimeout(() => this.shareSpeed(), 150);
    });
    this.speedInput.addEventListener('change', () => this.shareSpeed());
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

  showSpeed(speed) {
    this.speed = Math.max(0, Math.min(1, Math.round(speed * 100) / 100));
    this.speedInput.value = String(this.speed);
    this.speedValue.textContent = this.speed.toFixed(2);
  }

  shareSpeed() {
    clearTimeout(this.speedTimer);
    this.speedTimer = 0;
    const mode = this.playing ? 'play' : 'pause';
    this.emit({ t: 'lab', lab: 'saga', mode, scenario: this.scenario, seed: 1, at: Math.floor(this.now * 1000) / 1000, speed: this.speed });
  }

  applyState(state, elapsed = 0) {
    this.scenario = Object.hasOwn(SCENARIOS, state.scenario) ? state.scenario : 'paid';
    this.select.value = this.scenario;
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
    this.verdictBox.className = 'verdict';
    this.verdictBox.replaceChildren();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    this.verdictBox.className = 'verdict shown';
    this.verdictBox.innerHTML = `${ICON('check')}<span></span>`;
    this.verdictBox.querySelector('span').textContent = this.spec.verdict;
    this.updateButtons();
  }

  updateButtons() {
    const label = this.playing ? 'Пауза' : this.finished ? 'Ещё раз' : this.steps > 0 ? 'Дальше' : 'Запустить';
    this.playButton.innerHTML = `${ICON(this.playing ? 'pause' : 'play')}<span>${label}</span>`;
  }

  render(animate) {
    const step = this.steps ? this.spec.steps[this.steps - 1] : null;
    this.diagram.live(step ? { edges: step.edges, tone: step.tone, tokens: animate } : {});
    this.caption.querySelector('.t').textContent = `шаг ${this.steps}/${this.total()}`;
    const what = this.caption.querySelector('.what');
    what.replaceChildren();
    if (step) {
      what.append(element('span', `who ${step.tone}`, step.who), document.createTextNode(' ' + step.say + ' '), element('span', 'how', step.how));
    } else {
      what.textContent = `заказ ещё не оформлен: ${COUNT} кружки по ${rub(PRICE)}`;
    }
    this.renderState(this.world());
  }

  renderState(world) {
    const keys = new Set();
    const track = (items, prefix) => items.forEach((text, index) => keys.add(`${prefix}:${index}:${text}`));
    const status = world.order.length ? world.order[world.order.length - 1] : '—';
    const orderCard = card('Заказ · order-service',
      element('div', 'state-value', status),
      chips(world.order, 'step-chip', this.seen, 'order'));
    track(world.order, 'order');
    const stock = card('Остатки · catalog-service',
      element('div', 'state-value', `${world.stock.free} в продаже`),
      element('div', 'state-note', world.stock.reserved ? `${world.stock.reserved} в резерве` : 'резерва нет'));
    const entries = world.payment.entries.map(([name, value]) => `${name}: ${value < 0 ? '−' : ''}${rub(Math.abs(value))}`);
    const payment = card('Платёж · payment-service',
      element('div', 'state-value', world.payment.status),
      chips(entries, 'entry-chip', this.seen, 'entry'));
    track(entries, 'entry');
    const events = card('События · Kafka', chips(world.events, 'event-chip', this.seen, 'event'));
    track(world.events, 'event');
    const mails = world.mail.map(text => `письмо: ${text}`);
    const feed = world.feed ? [world.feed] : [];
    const effects = card('Уведомления и лента', chips([...mails, ...feed], 'mail-chip', this.seen, 'mail'));
    track([...mails, ...feed], 'mail');
    this.stateBox.replaceChildren(orderCard, stock, payment, events, effects);
    this.seen = keys;
  }
}
