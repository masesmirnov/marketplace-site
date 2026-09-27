import { element } from './code.js';

const POLL_MS = 5000;
const HISTORY = 30;

export function mountHealth(root) {
  const probe = root.querySelector('.probe');
  const code = probe.querySelector('.probe-code');
  const body = root.querySelector('.probe-body');
  const latency = root.querySelector('[data-health="latency"]');
  const age = root.querySelector('[data-health="age"]');
  const spark = root.querySelector('.spark');
  const history = [];
  let checkedAt = 0;
  let visible = false;
  let timer = 0;

  function show(result) {
    const ok = Boolean(result.ok);
    probe.classList.toggle('ok', ok);
    probe.classList.toggle('down', !ok);
    code.textContent = result.status ? `${result.status} ${result.reason || ''}`.trim() : result.reason || 'нет ответа';
    body.textContent = result.body || (result.error ? result.error : '—');
    latency.textContent = typeof result.ms === 'number' ? `${result.ms.toFixed(1)} мс` : '—';
    checkedAt = Date.now();
    history.push({ ok, ms: typeof result.ms === 'number' ? result.ms : 0 });
    if (history.length > HISTORY) history.shift();
    const top = Math.max(5, ...history.map(item => item.ms));
    const empty = Array.from({ length: HISTORY - history.length }, () => element('span', 'empty'));
    spark.replaceChildren(...empty, ...history.map(item => {
      const bar = element('span', item.ok ? '' : 'bad');
      bar.style.height = `${Math.max(8, item.ok ? item.ms / top * 100 : 100)}%`;
      bar.title = item.ok ? `${item.ms.toFixed(1)} мс` : 'нет ответа';
      return bar;
    }));
    tickAge();
  }

  function tickAge() {
    if (!checkedAt) return;
    const seconds = Math.max(0, Math.round((Date.now() - checkedAt) / 1000));
    age.textContent = seconds < 2 ? 'проверено только что' : `проверено ${seconds} с назад`;
  }

  async function check() {
    clearTimeout(timer);
    try {
      const response = await fetch('api/health', { cache: 'no-store' });
      const answer = await response.json();
      if (response.status !== 429) show(response.ok ? answer : { ok: false, status: 0, reason: answer.error || `ошибка ${response.status}` });
    } catch {
      show({ ok: false, status: 0, reason: 'страница не достучалась до сервера' });
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (visible && document.visibilityState === 'visible') timer = setTimeout(check, POLL_MS);
  }

  new IntersectionObserver(entries => {
    const was = visible;
    visible = entries.some(entry => entry.isIntersecting);
    if (visible && !was) check();
    else if (!visible) clearTimeout(timer);
  }).observe(root);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && visible) check();
    else clearTimeout(timer);
  });
  setInterval(tickAge, 1000);
}
