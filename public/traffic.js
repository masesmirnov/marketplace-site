import { DOMAINS, join, laneY, sample } from './layout.js';

const SYNC_SPEED = 0.6;
const EVENT_SPEED = 0.34;
const STORE_SPEED = 0.22;
const BASE_RATE = 1.5;
const PARTICLE_LIMIT = 90;
const ENTRY = { buyer: 'storefront', seller: 'cabinet' };

class Abort extends Error {}

const FLOWS = [
  { id: 'feed', weight: 5, browse: true, run: async t => { await t.enter('buyer', 'feed'); await t.store('feed'); } },
  { id: 'card', weight: 4, browse: true, run: async t => { await t.enter('buyer', 'catalog'); await t.store('catalog'); } },
  {
    id: 'edit',
    weight: 1.1,
    run: async t => {
      await t.enter('seller', 'catalog');
      await t.store('catalog');
      t.event('catalog', 'product', { feed: () => t.store('feed') });
    }
  },
  {
    id: 'login',
    weight: 0.9,
    run: async t => {
      await t.enter('buyer', 'user');
      await t.store('user');
      if (!t.guided && Math.random() < 0.5) t.event('user', 'user', { notification: () => t.store('notification') });
    }
  },
  {
    id: 'checkout',
    weight: 0.7,
    run: async t => {
      await t.enter('buyer', 'order');
      await t.store('order');
      await t.call('order', 'catalog');
      await t.store('catalog');
      await t.call('order', 'payment');
      await Promise.all([t.store('payment'), t.call('payment', 'psp')]);
      await t.call('buyer', 'psp');
      await t.call('psp', 'payment');
      await t.store('payment');
      t.event('payment', 'payment', {
        order: async () => {
          await t.store('order');
          t.event('order', 'order', {
            feed: () => t.store('feed'),
            notification: async () => {
              await t.store('notification');
              await t.call('notification', 'mailers');
            }
          });
        }
      });
    }
  }
];

export class Traffic {
  constructor(map, hooks = {}) {
    this.map = map;
    this.hooks = hooks;
    this.running = false;
    this.load = 1;
    this.down = new Set();
    this.queues = new Map();
    this.outbox = new Map();
    this.timer = 0;
    this.generation = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule(200);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = 0;
  }

  reset() {
    this.generation += 1;
    this.queues.clear();
    this.outbox.clear();
    this.map.clearParked();
    this.changed();
  }

  setLoad(value) {
    this.load = value;
  }

  setDown(ids) {
    const before = this.down;
    this.down = new Set(ids);
    for (const id of before) {
      if (!this.down.has(id)) this.revive(id);
    }
    this.changed();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.spawn();
      const weight = FLOWS.reduce((sum, flow) => sum + flow.weight * (flow.browse ? this.load : 1), 0);
      const base = FLOWS.reduce((sum, flow) => sum + flow.weight, 0);
      const rate = BASE_RATE * weight / base;
      this.schedule(Math.max(90, Math.min(1800, -Math.log(1 - Math.random()) / rate * 1000)));
    }, delay);
  }

  spawn() {
    if (this.map.particles.size > PARTICLE_LIMIT || document.visibilityState !== 'visible') return;
    const total = FLOWS.reduce((sum, flow) => sum + flow.weight * (flow.browse ? this.load : 1), 0);
    let pick = Math.random() * total;
    const flow = FLOWS.find(item => (pick -= item.weight * (item.browse ? this.load : 1)) <= 0) || FLOWS[0];
    flow.run(this.context()).catch(error => {
      if (!(error instanceof Abort)) throw error;
    });
  }

  guide(id, style) {
    const flow = FLOWS.find(item => item.id === id);
    return flow.run(this.context(style)).then(() => true, error => {
      if (error instanceof Abort) return false;
      throw error;
    });
  }

  context(style = null) {
    const generation = this.generation;
    const traffic = this;
    const alive = () => {
      if (generation !== traffic.generation) throw new Abort();
    };
    return {
      guided: Boolean(style),
      enter: async (person, domain) => {
        alive();
        await traffic.call(person, ENTRY[person], generation, style);
        if (traffic.map.layout.nodes.gateway) {
          await traffic.call(ENTRY[person], 'gateway', generation, style);
          await traffic.call('gateway', domain, generation, style);
        } else {
          await traffic.call(ENTRY[person], domain, generation, style);
        }
      },
      call: (from, to) => {
        alive();
        return traffic.call(from, to, generation, style);
      },
      store: domain => {
        alive();
        return traffic.store(domain, generation, style);
      },
      event: (producer, topic, handlers) => {
        if (generation !== traffic.generation) return;
        traffic.event(producer, topic, handlers, generation, style);
      }
    };
  }

  styled(options, style, edges = []) {
    if (!style) return options;
    if (style.onHop) style.onHop(edges);
    return { ...options, tone: options.tone === 'fail' ? 'fail' : 'mark', duration: options.duration * (style.slow || 1) };
  }

  node(id) {
    return DOMAINS.includes(id) ? this.map.layout.container[id] : id;
  }

  isDown(id) {
    return this.down.has(id) || this.down.has(this.node(id));
  }

  move(track, options, generation) {
    return new Promise((resolve, reject) => {
      this.map.travel({
        track,
        ...options,
        onDone: (x, y) => {
          if (generation !== this.generation) {
            reject(new Abort());
            return;
          }
          resolve([x, y]);
        }
      });
    });
  }

  async call(from, to, generation, style = null) {
    const a = this.node(from);
    const b = this.node(to);
    if (a === b) {
      const track = sample(this.map.innerPoints(from, to), 8);
      await this.move(track, this.styled({ tone: 'ink', kind: 'sync', duration: Math.max(260, track.length / SYNC_SPEED), arrive: to }, style), generation);
      return;
    }
    const edge = this.map.edgeBetween(a, b);
    if (!edge) return;
    const track = this.map.trackOf(edge.id);
    const duration = track.length / SYNC_SPEED;
    if (this.isDown(to)) {
      const [x, y] = await this.move(track, this.styled({ tone: 'fail', kind: 'sync', duration, edges: [edge.id] }, style, [edge.id]), generation);
      this.map.burst(x, y);
      throw new Abort();
    }
    await this.move(track, this.styled({ tone: 'ink', kind: 'sync', duration, edges: [edge.id], arrive: b }, style, [edge.id]), generation);
    if (b !== to && DOMAINS.includes(to)) this.map.pulse(to, 'ink');
  }

  async store(domain, generation, style = null) {
    const container = this.node(domain);
    const store = this.map.layout.storeOf[domain];
    const edge = this.map.edgeBetween(container, store);
    if (!edge) return;
    const track = this.map.trackOf(edge.id);
    await this.move(track, this.styled({ tone: domain, kind: 'store', duration: Math.max(220, track.length / STORE_SPEED), edges: [edge.id], arrive: store }, style, [edge.id]), generation);
  }

  event(producer, topic, handlers, generation, style = null) {
    const source = this.node(producer);
    const groups = new Map();
    for (const [consumer, handler] of Object.entries(handlers)) {
      const target = this.node(consumer);
      if (!groups.has(target)) groups.set(target, []);
      groups.get(target).push({ consumer, handler });
    }
    const remote = [];
    for (const [target, list] of groups) {
      if (target === source || !this.map.layout.nodes.kafka) {
        for (const { consumer, handler } of list) this.inner(producer, consumer, topic, handler, generation, style);
      } else {
        remote.push({ target, list });
      }
    }
    if (!remote.length) return;
    if (this.down.has('kafka')) {
      this.hold(this.outbox, source, { producer, topic, remote });
      return;
    }
    this.publish(producer, topic, remote, generation, style);
  }

  inner(producer, consumer, topic, handler, generation, style = null) {
    const points = this.map.innerPoints(producer, consumer);
    const track = sample(points, 8);
    this.move(track, this.styled({ tone: topic, kind: 'event', duration: Math.max(420, track.length / EVENT_SPEED), arrive: consumer, trail: true }, style), generation)
      .then(() => this.finish(handler))
      .catch(error => {
        if (!(error instanceof Abort)) throw error;
      });
  }

  publish(producer, topic, remote, generation, style = null) {
    const source = this.node(producer);
    const track = sample(this.map.publishPoints(source, topic));
    const edge = this.map.asyncEdge(source, 'kafka');
    const edges = edge ? [edge.id] : [];
    this.move(track, this.styled({ tone: topic, kind: 'event', duration: track.length / EVENT_SPEED, edges }, style, edges), generation)
      .then(() => {
        for (const { target, list } of remote) this.deliver(source, target, topic, list, generation, false, style);
      })
      .catch(error => {
        if (!(error instanceof Abort)) throw error;
      });
  }

  deliver(source, target, topic, list, generation, parked, style = null) {
    if (this.isDown(target)) {
      this.hold(this.queues, target, { source, topic, list });
      return;
    }
    const from = parked ? this.map.consumeX(target) - 14 : this.map.publishX(source);
    const lane = this.map.lanePoints(topic, from, this.map.consumeX(target));
    const track = sample(join(lane, this.map.consumePoints(target, topic)));
    const edge = this.map.asyncEdge('kafka', target);
    const edges = edge ? [edge.id] : [];
    this.move(track, this.styled({ tone: topic, kind: 'event', duration: track.length / EVENT_SPEED, edges, arrive: target }, style, edges), generation)
      .then(() => {
        for (const { consumer, handler } of list) {
          if (consumer !== target) this.map.pulse(consumer, topic);
          this.finish(handler);
        }
      })
      .catch(error => {
        if (!(error instanceof Abort)) throw error;
      });
  }

  finish(handler) {
    Promise.resolve()
      .then(handler)
      .catch(error => {
        if (!(error instanceof Abort)) throw error;
      });
  }

  hold(store, key, entry) {
    if (!store.has(key)) store.set(key, []);
    const list = store.get(key);
    list.push(entry);
    if (list.length > 40) list.shift();
    this.changed();
  }

  revive(id) {
    const generation = this.generation;
    if (id === 'kafka') {
      const waiting = Array.from(this.outbox.entries());
      this.outbox.clear();
      let delay = 120;
      for (const [, list] of waiting) {
        for (const entry of list) {
          setTimeout(() => {
            if (generation === this.generation) this.publish(entry.producer, entry.topic, entry.remote, generation);
          }, delay);
          delay += 160;
        }
      }
      return;
    }
    const list = this.queues.get(id) || [];
    this.queues.delete(id);
    list.forEach((entry, index) => {
      setTimeout(() => {
        if (generation === this.generation) this.deliver(entry.source, id, entry.topic, entry.list, generation, true);
      }, 120 + index * 150);
    });
  }

  changed() {
    for (const [key, list] of this.queues) {
      const topic = list[list.length - 1]?.topic;
      if (topic) this.map.park(key, this.map.consumeX(key) - 12, laneY(topic), topic, list.length);
    }
    for (const key of Array.from(this.map.parked.keys())) {
      if (!this.queues.get(key)?.length) this.map.park(key, 0, 0, 'ink', 0);
    }
    if (this.hooks.onChange) this.hooks.onChange(this.waiting());
  }

  waiting() {
    const count = store => Array.from(store.values()).reduce((sum, list) => sum + list.length, 0);
    return {
      queues: Object.fromEntries(Array.from(this.queues, ([key, list]) => [key, list.length])),
      outbox: Object.fromEntries(Array.from(this.outbox, ([key, list]) => [key, list.length])),
      total: count(this.queues) + count(this.outbox)
    };
  }
}
