import { element, highlight } from './code.js';
import { mountHealth } from './health.js';

const REPO = 'https://github.com/masesmirnov/marketplace-architecture/blob/main/';

const PYTHON = { keywords: new Set(['from', 'import', 'def', 'return', 'class', 'async', 'await']), builtins: new Set(), definers: new Set(['def', 'class']) };
const DOCKER = { keywords: new Set(['FROM', 'WORKDIR', 'COPY', 'RUN', 'EXPOSE', 'CMD']), builtins: new Set(), definers: new Set() };
const PLAIN = { keywords: new Set(), builtins: new Set(), definers: new Set() };

export const FILES = [
  {
    path: 'services/catalog/main.py',
    url: 'catalog/main.py',
    kind: 'python',
    about: 'Весь код сервиса: приложение FastAPI с одним маршрутом. Этот же файл сейчас работает на сервере, его ответ справа.',
    notes: { 1: 'фреймворк', 3: 'приложение', 6: 'единственный маршрут', 8: 'FastAPI отвечает 200 и JSON' }
  },
  {
    path: 'services/catalog/requirements.txt',
    url: 'repo/services/catalog/requirements.txt',
    kind: 'plain',
    about: 'Зависимости с закреплёнными версиями: сборка через месяц даст тот же результат.',
    notes: { 1: 'веб-фреймворк', 2: 'ASGI-сервер, запускает приложение' }
  },
  {
    path: 'services/catalog/Dockerfile',
    url: 'repo/services/catalog/Dockerfile',
    kind: 'docker',
    about: 'Образ сервиса. Зависимости ставятся до копирования кода, поэтому правка main.py не переустанавливает пакеты.',
    notes: { 1: 'лёгкий образ с Python 3.13', 3: 'рабочая папка в контейнере', 5: 'сначала только зависимости', 6: 'этот слой кэшируется', 8: 'код копируется последним', 10: 'порт сервиса', 12: 'uvicorn запускает app из main.py' }
  },
  {
    path: 'docker-compose.yml',
    url: 'repo/docker-compose.yml',
    kind: 'yaml',
    about: 'Запуск одной командой. Docker сам опрашивает /health, и docker compose up --wait ждёт статуса healthy.',
    notes: { 2: 'один сервис из шести', 3: 'образ из services/catalog', 5: 'порт 8000 наружу', 7: 'проверка без curl: Python уже есть в образе', 8: 'раз в 10 секунд', 10: 'три неудачи подряд — unhealthy', 11: 'время на запуск' }
  },
  {
    path: '.gitignore',
    url: 'repo/gitignore.txt',
    kind: 'plain',
    about: 'Кэш Python и виртуальное окружение в репозиторий не попадают.',
    notes: {}
  },
  {
    path: 'docs/c4-container.svg',
    url: 'repo/docs/c4-container.svg',
    kind: 'image',
    about: 'Исходная C4-диаграмма контейнеров из репозитория, по ней и проверяют первый пункт задания. Карта на этой странице нарисована по тем же координатам.'
  }
];

function yaml(line) {
  const match = line.match(/^(\s*)(- )?([\w.-]+)(:)(.*)$/);
  if (!match) return highlight(line, PLAIN);
  const [, indent, dash = '', key, colon, rest] = match;
  return `${indent}${dash}<span class="tok-f">${key}</span>${colon}${highlight(rest, PLAIN)}`;
}

function paint(line, kind) {
  if (kind === 'python') return highlight(line, PYTHON);
  if (kind === 'docker') return highlight(line, DOCKER);
  if (kind === 'yaml') return yaml(line);
  return highlight(line, PLAIN);
}

export class Codebook {
  constructor(root) {
    this.root = root;
    this.cache = new Map();
    this.current = null;
    this.list = root.querySelector('.files-list');
    this.view = root.querySelector('.viewer-body');
    this.path = root.querySelector('.viewer-path');
    this.link = root.querySelector('.viewer-link');
    this.about = root.querySelector('.viewer-about');
    this.buttons = new Map(FILES.map(file => {
      const button = element('button', 'file');
      button.type = 'button';
      const parts = file.path.split('/');
      const label = element('span', 'file-name');
      label.textContent = parts.pop();
      const folder = element('span', 'file-dir');
      folder.textContent = parts.length ? parts.join('/') + '/' : '';
      button.append(folder, label);
      button.addEventListener('click', () => this.open(file.path));
      this.list.append(button);
      return [file.path, button];
    }));
    mountHealth(root.querySelector('#health'));
    this.open(FILES[0].path);
  }

  async open(path) {
    const file = FILES.find(item => item.path === path) || FILES[0];
    this.current = file.path;
    for (const [key, button] of this.buttons) button.setAttribute('aria-current', String(key === file.path));
    this.path.textContent = file.path;
    this.link.href = REPO + file.path;
    this.about.textContent = file.about;
    this.root.dataset.kind = file.kind;
    if (file.kind === 'image') {
      const image = element('img', 'diagram');
      image.src = file.url;
      image.alt = 'C4-диаграмма контейнеров маркетплейса из репозитория';
      this.view.replaceChildren(image);
      return;
    }
    let text = this.cache.get(file.url);
    if (text === undefined) {
      try {
        const response = await fetch(file.url);
        text = response.ok ? await response.text() : '';
      } catch {
        text = '';
      }
      this.cache.set(file.url, text);
    }
    if (this.current !== file.path) return;
    const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    const pre = element('pre', 'code');
    lines.forEach((line, index) => {
      const row = element('span', 'ln', `<span class="no">${index + 1}</span><span class="src">${paint(line, file.kind) || ' '}</span>`);
      const note = file.notes[index + 1];
      if (note) {
        const tag = element('span', 'tag');
        tag.textContent = note;
        row.append(tag);
        row.classList.add('noted');
      }
      pre.append(row);
    });
    this.view.replaceChildren(pre);
  }
}
