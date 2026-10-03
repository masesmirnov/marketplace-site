export const NODES = {
  seller: { kind: 'person', icon: 'person', name: 'Продавец', tech: 'Person', brief: 'продаёт товары', desc: ['продаёт товары на маркетплейсе'] },
  buyer: { kind: 'person', icon: 'person', name: 'Покупатель', tech: 'Person', brief: 'смотрит и покупает', desc: ['смотрит ленту и покупает товары'] },
  mailers: { kind: 'external', icon: 'mail', name: 'Сервисы рассылок', tech: 'Software System', desc: ['email, SMS и push'] },
  psp: { kind: 'external', icon: 'bank', name: 'Платёжный провайдер', tech: 'Software System', desc: ['оплата картами и СБП,', 'возвраты и выплаты'] },
  cabinet: { kind: 'container', icon: 'store', name: 'Кабинет продавца', tech: 'Container: React SPA', desc: ['товары, цены и остатки,', 'заказы покупателей'] },
  storefront: { kind: 'container', icon: 'cart', name: 'Витрина', tech: 'Container: React SPA', desc: ['лента, карточки товаров,', 'корзина и заказы'] },
  gateway: {
    kind: 'container',
    icon: 'shield',
    name: 'API Gateway',
    tech: 'Container: Envoy',
    brief: 'маршруты, проверка JWT, лимиты',
    desc: ['единая точка входа: маршруты,', 'проверка JWT, лимиты запросов'],
    does: ['маршрутизацию запросов витрины и кабинета продавца', 'проверку JWT по публичным ключам user-service', 'передачу сервисам id и роли пользователя в заголовках', 'ограничение частоты запросов']
  },
  notification: {
    kind: 'container',
    service: 'notification-service',
    icon: 'bell',
    zone: 'письма, SMS и push о смене статуса заказа, история отправок',
    name: 'Сервис уведомлений',
    tech: 'Container: Python, FastAPI',
    desc: ['письма, SMS и push', 'о статусах заказов'],
    domain: 'Уведомления',
    owns: ['копия контактов получателей', 'шаблоны', 'журнал отправок'],
    does: ['отправку уведомлений о смене статуса заказа'],
    why: 'работает только в фоне, по событиям; сбой рассылки не должен мешать оформить заказ'
  },
  user: {
    kind: 'container',
    service: 'user-service',
    icon: 'users',
    zone: 'регистрация и вход покупателей и продавцов, профили, роли, выпуск JWT',
    name: 'Сервис пользователей',
    tech: 'Container: Python, FastAPI',
    desc: ['покупатели и продавцы:', 'вход, роли, выпуск JWT'],
    domain: 'Пользователи',
    owns: ['учётные записи', 'профили покупателей и продавцов', 'роли'],
    does: ['вход', 'выпуск JWT'],
    why: 'хранит пароли и персональные данные, их безопаснее держать отдельно от остального кода'
  },
  feed: {
    kind: 'container',
    service: 'feed-service',
    icon: 'sparkles',
    zone: 'персональная выдача: учёт просмотров и покупок, интересы покупателя, ранжирование товаров',
    name: 'Сервис ленты',
    tech: 'Container: Python, FastAPI',
    desc: ['персональная выдача', 'товаров по интересам'],
    domain: 'Лента',
    owns: ['интересы покупателей', 'просмотры', 'готовые ленты', 'копия карточек товаров для выдачи'],
    does: ['построение и выдачу ленты'],
    why: 'самый нагруженный путь чтения и своё хранилище под готовые ленты; алгоритм выдачи меняется часто и не должен задевать заказы'
  },
  catalog: {
    kind: 'container',
    service: 'catalog-service',
    icon: 'tag',
    zone: 'карточки товаров, категории, цены и остатки; продавец управляет своими товарами',
    name: 'Сервис каталога',
    tech: 'Container: Python, FastAPI',
    desc: ['товары, цены, остатки;', 'их правит продавец'],
    domain: 'Каталог',
    owns: ['товары', 'категории', 'цены', 'остатки и их резервы'],
    does: ['управление карточками', 'резерв остатков и его снятие'],
    why: 'пишут продавцы, читают все; нагрузка на чтение высокая, поэтому сервис масштабируется своими экземплярами'
  },
  order: {
    kind: 'container',
    service: 'order-service',
    icon: 'receipt',
    zone: 'корзина, оформление заказа, его статусы от создания до получения или отмены',
    name: 'Сервис заказов',
    tech: 'Container: Python, FastAPI',
    desc: ['корзина, оформление,', 'статусы заказа'],
    domain: 'Заказы',
    owns: ['корзины', 'заказы', 'позиции с ценой на момент покупки', 'история статусов'],
    does: ['оформление заказа', 'его статусы'],
    why: 'центр оформления: статусы заказа и сага с каталогом и платежами'
  },
  payment: {
    kind: 'container',
    service: 'payment-service',
    icon: 'card',
    zone: 'оплата через платёжного провайдера, возвраты, учёт по каждому заказу (комиссия маркетплейса и сумма продавцу) и выплаты продавцам',
    name: 'Сервис платежей',
    tech: 'Container: Python, FastAPI',
    desc: ['оплата, возвраты, выплаты,', 'учёт комиссий'],
    domain: 'Платежи',
    owns: ['платежи', 'возвраты', 'выплаты продавцам', 'проводки: комиссия и доля продавца'],
    does: ['оплату', 'возвраты', 'выплаты', 'учёт'],
    why: 'единственный, кто работает с деньгами и провайдером: изоляция сужает круг кода с доступом к платёжным данным и упрощает аудит'
  },
  notificationDb: { kind: 'store', name: 'БД уведомлений', tech: 'Container: PostgreSQL', desc: ['контакты,', 'журнал отправок'] },
  userDb: { kind: 'store', name: 'БД пользователей', tech: 'Container: PostgreSQL', desc: ['учётные записи,', 'профили, роли'] },
  feedStore: { kind: 'store', name: 'Хранилище ленты', tech: 'Container: Redis', desc: ['интересы покупателей,', 'готовые ленты'] },
  catalogDb: { kind: 'store', name: 'БД каталога', tech: 'Container: PostgreSQL', desc: ['товары, категории,', 'цены, остатки'] },
  orderDb: { kind: 'store', name: 'БД заказов', tech: 'Container: PostgreSQL', desc: ['заказы, позиции,', 'история статусов'] },
  paymentDb: { kind: 'store', name: 'БД платежей', tech: 'Container: PostgreSQL', desc: ['платежи, возвраты,', 'проводки'] },
  kafka: {
    kind: 'bus',
    icon: 'stream',
    name: 'Брокер событий',
    tech: 'Container: Apache Kafka',
    desc: ['топики user.*, product.*, order.*, payment.*'],
    does: ['доставку одного события нескольким сервисам', 'хранение истории событий несколько недель: копии данных у ленты можно собрать заново']
  },
  accounts: { kind: 'container', name: 'Аккаунты', tech: 'Container: Python, FastAPI', desc: ['пользователи, вход,', 'выпуск JWT'] },
  commerce: { kind: 'container', name: 'Коммерция', tech: 'Container: Python, FastAPI', desc: [], modules: ['каталог', 'заказы', 'платежи'] },
  engagement: { kind: 'container', name: 'Вовлечение', tech: 'Container: Python, FastAPI', desc: [], modules: ['лента', 'уведомления'] },
  accountsDb: { kind: 'store', name: 'БД аккаунтов', tech: 'Container: PostgreSQL', desc: ['учётные записи,', 'профили, роли'] },
  commerceDb: { kind: 'store', name: 'БД коммерции', tech: 'Container: PostgreSQL', desc: ['товары, заказы и платежи', 'в одной базе'] },
  engagementStore: { kind: 'store', name: 'Хранилище вовлечения', tech: 'Container: Redis, PostgreSQL', desc: ['ленты, контакты,', 'журнал отправок'] },
  monolith: { kind: 'container', name: 'Маркетплейс', tech: 'Container: Python, FastAPI', desc: [], modules: ['пользователи', 'лента', 'каталог', 'заказы', 'платежи', 'уведомления'] },
  monolithDb: { kind: 'store', name: 'БД маркетплейса', tech: 'Container: PostgreSQL', desc: ['схема на модуль:', 'шесть схем в одной базе'] }
};

export const EDGES = [
  { id: 'seller-cabinet', from: 'seller', to: 'cabinet', kind: 'sync', label: 'использует', tech: 'HTTPS' },
  { id: 'buyer-storefront', from: 'buyer', to: 'storefront', kind: 'sync', label: 'использует', tech: 'HTTPS' },
  { id: 'buyer-psp', from: 'buyer', to: 'psp', kind: 'sync', label: 'оплачивает заказ', tech: 'HTTPS' },
  { id: 'cabinet-gateway', from: 'cabinet', to: 'gateway', kind: 'sync', label: 'вызывает API', tech: 'HTTPS/JSON' },
  { id: 'storefront-gateway', from: 'storefront', to: 'gateway', kind: 'sync', label: 'вызывает API', tech: 'HTTPS/JSON' },
  { id: 'gateway-user', from: 'gateway', to: 'user', kind: 'sync', label: 'вход, профиль; ключи JWT (JWKS)', tech: 'HTTP/JSON' },
  { id: 'gateway-feed', from: 'gateway', to: 'feed', kind: 'sync', label: 'лента и отметки о просмотрах', tech: 'HTTP/JSON' },
  { id: 'gateway-catalog', from: 'gateway', to: 'catalog', kind: 'sync', label: 'карточки товаров, правки продавца', tech: 'HTTP/JSON' },
  { id: 'gateway-order', from: 'gateway', to: 'order', kind: 'sync', label: 'корзина и заказы', tech: 'HTTP/JSON' },
  { id: 'order-catalog', from: 'order', to: 'catalog', kind: 'sync', label: 'сверить цены, зарезервировать или снять резерв', tech: 'HTTP/JSON' },
  { id: 'order-payment', from: 'order', to: 'payment', kind: 'sync', label: 'создать платёж или запросить возврат', tech: 'HTTP/JSON' },
  { id: 'payment-psp', from: 'payment', to: 'psp', kind: 'sync', label: 'провести оплату, возврат или выплату', tech: 'HTTPS' },
  { id: 'psp-payment', from: 'psp', to: 'payment', kind: 'sync', label: 'результат оплаты вебхуком', tech: 'HTTPS, вебхук' },
  { id: 'notification-mailers', from: 'notification', to: 'mailers', kind: 'sync', label: 'отправить письмо, SMS или push', tech: 'HTTPS, SMTP' },
  { id: 'notification-notificationDb', from: 'notification', to: 'notificationDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'user-userDb', from: 'user', to: 'userDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'feed-feedStore', from: 'feed', to: 'feedStore', kind: 'store', label: 'читает и пишет', tech: 'Redis' },
  { id: 'catalog-catalogDb', from: 'catalog', to: 'catalogDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'order-orderDb', from: 'order', to: 'orderDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'payment-paymentDb', from: 'payment', to: 'paymentDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'user-kafka', from: 'user', to: 'kafka', kind: 'async', topics: 'user.*', label: 'публикует user.*' },
  { id: 'catalog-kafka', from: 'catalog', to: 'kafka', kind: 'async', topics: 'product.*', label: 'публикует product.*' },
  { id: 'order-kafka', from: 'order', to: 'kafka', kind: 'async', topics: 'order.*', label: 'публикует order.*' },
  { id: 'payment-kafka', from: 'payment', to: 'kafka', kind: 'async', topics: 'payment.*', label: 'публикует payment.*' },
  { id: 'kafka-notification', from: 'kafka', to: 'notification', kind: 'async', topics: 'order.*, user.*', label: 'читает order.*, user.*' },
  { id: 'kafka-feed', from: 'kafka', to: 'feed', kind: 'async', topics: 'product.*, order.*', label: 'читает product.*, order.*' },
  { id: 'kafka-order', from: 'kafka', to: 'order', kind: 'async', topics: 'payment.*', label: 'читает payment.*' },
  { id: 'accounts-accountsDb', from: 'accounts', to: 'accountsDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'commerce-commerceDb', from: 'commerce', to: 'commerceDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'engagement-engagementStore', from: 'engagement', to: 'engagementStore', kind: 'store', label: 'читает и пишет', tech: 'Redis, SQL' },
  { id: 'gateway-accounts', from: 'gateway', to: 'accounts', kind: 'sync', label: 'маршрутизирует запросы', tech: 'HTTP/JSON' },
  { id: 'gateway-engagement', from: 'gateway', to: 'engagement', kind: 'sync', label: 'маршрутизирует запросы', tech: 'HTTP/JSON' },
  { id: 'gateway-commerce', from: 'gateway', to: 'commerce', kind: 'sync', label: 'маршрутизирует запросы', tech: 'HTTP/JSON' },
  { id: 'commerce-psp', from: 'commerce', to: 'psp', kind: 'sync', label: 'проводит оплату, возвраты и выплаты', tech: 'HTTPS' },
  { id: 'psp-commerce', from: 'psp', to: 'commerce', kind: 'sync', label: 'результат оплаты', tech: 'HTTPS, вебхук' },
  { id: 'engagement-mailers', from: 'engagement', to: 'mailers', kind: 'sync', label: 'отправляет сообщения', tech: 'HTTPS, SMTP' },
  { id: 'accounts-kafka', from: 'accounts', to: 'kafka', kind: 'async', topics: 'user.*', label: 'публикует user.*' },
  { id: 'commerce-kafka', from: 'commerce', to: 'kafka', kind: 'async', topics: 'product.*, order.*', label: 'публикует product.*, order.*' },
  { id: 'kafka-engagement', from: 'kafka', to: 'engagement', kind: 'async', topics: 'user.*, product.*, order.*', label: 'читает user.*, product.*, order.*' },
  { id: 'cabinet-monolith', from: 'cabinet', to: 'monolith', kind: 'sync', label: 'вызывает API', tech: 'HTTPS/JSON' },
  { id: 'storefront-monolith', from: 'storefront', to: 'monolith', kind: 'sync', label: 'вызывает API', tech: 'HTTPS/JSON' },
  { id: 'monolith-monolithDb', from: 'monolith', to: 'monolithDb', kind: 'store', label: 'читает и пишет', tech: 'SQL' },
  { id: 'monolith-psp', from: 'monolith', to: 'psp', kind: 'sync', label: 'проводит оплату, возвраты и выплаты', tech: 'HTTPS' },
  { id: 'psp-monolith', from: 'psp', to: 'monolith', kind: 'sync', label: 'результат оплаты', tech: 'HTTPS, вебхук' },
  { id: 'monolith-mailers', from: 'monolith', to: 'mailers', kind: 'sync', label: 'отправляет сообщения', tech: 'HTTPS, SMTP' }
];

export const EDGE = Object.fromEntries(EDGES.map(edge => [edge.id, edge]));

export const VARIANTS = {
  domain: {
    title: 'Сервис на домен',
    short: 'шесть сервисов, API Gateway и Kafka',
    chosen: true
  },
  coarse: {
    title: 'Три укрупнённых сервиса',
    short: 'аккаунты, коммерция и вовлечение'
  },
  monolith: {
    title: 'Модульный монолит',
    short: 'одно приложение и одна база'
  }
};

export const VARIANT_ORDER = ['monolith', 'coarse', 'domain'];

export const COMPARISON = [
  { name: 'Лента под нагрузкой', monolith: ['bad', 'только со всем'], coarse: ['part', 'вместе с рассылками'], domain: ['good', 'отдельно'] },
  { name: 'Сбой модуля', monolith: ['bad', 'роняет и заказы'], coarse: ['part', 'лента и рассылки вместе'], domain: ['good', 'изолирован'] },
  { name: 'Платежи', monolith: ['bad', 'в общей базе'], coarse: ['part', 'рядом с каталогом'], domain: ['good', 'отдельный сервис'] },
  { name: 'Данные', monolith: ['bad', 'общая база'], coarse: ['part', 'три базы'], domain: ['good', 'своя у каждого'] },
  { name: 'Выкатка', monolith: ['bad', 'целиком'], coarse: ['part', 'тремя частями'], domain: ['good', 'по одному'] },
  { name: 'Заказ и оплата', monolith: ['good', 'одна транзакция'], coarse: ['good', 'без саги'], domain: ['bad', 'сага и outbox'] },
  { name: 'Эксплуатация', monolith: ['good', 'один процесс'], coarse: ['part', 'три сервиса, три базы'], domain: ['bad', 'Kafka, шесть баз, шлюз'] }
];
