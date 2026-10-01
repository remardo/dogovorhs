# Инфраструктура DogovorHS (для агентов и людей)

Дата актуализации: 2026-10-01. Единственный источник правды по прод-окружению.

## Карта

| Что | Где | Домен |
|---|---|---|
| VPS (Docker, Traefik, Coolify v4) | `201.24.121.181`, SSH-алиас `myvps` (root, `~/.ssh/id_ed25519`, см. `~/.ssh/config`) | `sorokintech.ru` |
| Convex backend (self-hosted) | контейнер `448s20v2364kajumfugukaz9-181112953100`, volume `448s20v2364kajumfugukaz9-doghs-convex-data` | `https://cvdoghs.sorokintech.ru` |
| Frontend (nginx static) | контейнер `doghs-web`, файлы `/data/doghs-web/{dist,nginx.conf}` | `https://doghs.sorokintech.ru` (+ алиас `https://dogovor.sorokintech.ru`) |
| Реверс-прокси | контейнер `coolify-proxy` (Traefik v3.6), сеть `coolify`, TLS через `letsencrypt` | — |
| Админ-ключи/URL | локальный `.env.coolify` (gitignored, НЕ коммитить) | — |
| Референсный образец | Coolify-приложение `inmeya-convex` (`/data/coolify/applications/i74ow0ukehb0cm6fc0gslgsq/`, домен `convex.sorokintech.ru`) | — |

ВАЖНО: backend и frontend DogovorHS созданы **вручную через Docker CLI** (копированием паттерна Coolify),
в базе Coolify (`coolify-db`, таблицы `applications`/`services`) их **нет** — в UI Coolify они не отображаются.
Управляются только по SSH. Не пытаться «починить» через пересоздание в UI — сначала читать этот файл.

## Convex backend

- Compose-проект: `/data/coolify/applications/448s20v2364kajumfugukaz9/docker-compose.yaml`
  (образ `ghcr.io/get-convex/convex-backend:latest`, `expose 3210`, сеть `coolify`,
  volume `...-doghs-convex-data:/convex/data`).
- Env: `/data/coolify/applications/448s20v2364kajumfugukaz9/.env`
  (`CONVEX_CLOUD_ORIGIN` = `CONVEX_SITE_ORIGIN` = `https://cvdoghs.sorokintech.ru`, `PORT=3210`, `HOST=0.0.0.0`).
- Маршрутизация: Traefik-лейблы на контейнере `Host(cvdoghs.sorokintech.ru) -> :3210`
  (http→https редирект + https с `letsencrypt`). Других backend-портов наружу нет.
- Данные живут в Docker volume — удаление volume = потеря всех данных.

### Деплой функций Convex

```powershell
# 1. CLI подхватывает CONVEX_DEPLOYMENT из .env.local и конфликтует с self-hosted —
#    временно прячем файл, подсовываем ключи из .env.coolify
Rename-Item -LiteralPath .env.local -NewName .env.local.bak
Get-Content .env.coolify | ForEach-Object { $pair = $_ -split '=', 2; Set-Item -Path ("env:" + $pair[0]) -Value $pair[1] }
npx convex deploy --yes
Rename-Item -LiteralPath .env.local.bak -NewName .env.local
```

### Проверка и сид

```powershell
npx convex run dashboard:getSummary "{}"   # те же env-танцы, что выше
npx convex run seed:run                    # однократно на пустом инстансе (3 компании, 4 договора, ...)
```

### Admin-ключ

Привязан к инстансу (лежит в его volume). Новый инстанс = старый ключ недействителен
(`401 BadAdminKey`). Генерация нового:

```sh
ssh myvps 'docker exec 448s20v2364kajumfugukaz9-181112953100 ./generate_admin_key.sh'
```

Новый ключ записать в локальный `.env.coolify` (формат `convex-self-hosted|...` или
`self-hosted-convex|...` — оба принимает CLI). Никуда не коммитить.

### Диагностика

```sh
ssh myvps 'docker logs --tail 30 448s20v2364kajumfugukaz9-181112953100'
curl -sk -o /dev/null -w "%{http_code}\n" https://cvdoghs.sorokintech.ru/
```

- `503` на всё + тело `Service Unavailable` (20 байт) = срабатывает catch-all Traefik
  (`/data/coolify/proxy/dynamic/default_redirect_503.yaml`): **домен ни к чему не привязан**,
  сервис отсутствует или убран. Смотреть `docker ps`, лейблы, этот файл.
- `401 BadAdminKey` = маршрутизация ок, неверный ключ (см. генерацию выше).

## Frontend

- Файлы на VPS: `/data/doghs-web/dist` (сборка), `/data/doghs-web/nginx.conf` (копия `nginx.conf` из репо).
- Контейнер `doghs-web` (`nginx:alpine`, сеть `coolify`, рестарт `unless-stopped`):
  `/data/doghs-web/dist:/usr/share/nginx/html:ro`,
  `/data/doghs-web/nginx.conf:/etc/nginx/conf.d/default.conf:ro`.
- Traefik-лейблы: `Host(doghs.sorokintech.ru) || Host(dogovor.sorokintech.ru) -> :80`.
  Полный `docker run ...` — в git-истории нет, при пересоздании собрать по этому описанию
  (образец лейблов — compose backend'а выше).

### Деплой фронта

```powershell
# 1. Собрать СТРОГО с продовым URL (.env.local содержит dev-URL и перекроет сборку):
$env:VITE_CONVEX_URL="https://cvdoghs.sorokintech.ru"; npm run build
# 2. Проверить, что в бандл вшит прод (должен найтись cvdoghs):
Select-String -Path dist/assets/*.js -Pattern "cvdoghs" | Select-Object -First 1
# 3. Залить и поправить права (scp режет права до 700 -> nginx отдаёт 403):
scp -r dist nginx.conf myvps:/data/doghs-web/
ssh myvps 'chmod -R a+rX /data/doghs-web'
# 4. Перезапуск контейнера НЕ нужен (dist подмонтирован volume'ом).
```

Проверка: `https://doghs.sorokintech.ru/` → 200 (HTML), `/contracts` → 200 (тот же `index.html`, SPA-фолбэк).

## Секреты

- `.env.local` (dev: `CONVEX_DEPLOYMENT`, dev-`VITE_CONVEX_URL`), `.env.coolify` (prod: URL + admin key) —
  оба в `.gitignore`. В репозиторий попадает только `.env.example` (плейсхолдеры).
- Утечка admin-ключа = сгенерировать новый (`generate_admin_key.sh`) и обновить `.env.coolify`.

## Счета операторов (invoices)

- Таблица Convex `invoices` (+ экшены `invoiceActions.previewText/apply`, парсер `convex/_lib/invoiceParser.ts`).
- Текст из PDF извлекается **на клиенте** (`src/lib/pdfText.ts`, pdfjs + воркер через Vite):
  в Convex-изоляте worker-файл не попадает в бандл, серверный парсинг PDF невозможен.
  По той же причине сломан прод-путь Megafon-PDF в импорте детализаций (XLS/CSV работают) — чинить аналогично при необходимости.
- UI: страница «Счета» (`/invoices`): загрузка PDF → распознавание → автоподбор договора
  по номеру (нормализация: верхный регистр без пробелов/дефисов/слешей) и компании по ИНН →
  применение (создаёт счёт + расход с документом, тип услуги выбирается).
- Исходники счетов: локальная папка `billing-inbox/` (gitignored, НЕ в `public/` — иначе уедут в dist).
- Парсер покрыт юнитами на реальных фрагментах (`invoiceParser.test.ts`); грабли уже найдены и учтены:
  `\b`/`\w` в JS не работают для кириллицы, pdfjs декодирует cp1251-шрифты как MacRoman
  (лечится табличным перекодированием в `fixMojibake`), часть счетов — OCR-мусор.
- Первая загрузка (2026-10-01): 37 PDF → 35 счетов + 2 детализации (документами к родительским),
  создано 11 операторов, 1 компания (Техно Плюс), 34 договора; 3 договора синтезированы
  (МОСТ/ФК-бн, РУНЕТ/ФК-бн, л/с Т2 как номер) — помечены в примечаниях.
- Там же: удалены демо-данные сида (расходы 2024 на 414 155 ₽, 4 договора *-2024/*, SIM, сотрудники, тарифы).
  Компании/операторы оставлены — к ним привязаны настоящие счета. Контрольная сумма всех
  счетов: 374 882,53 ₽. Авансовые счета ЭР-Телеком отнесены на октябрь (период услуг),
  МОСТ — на декабрь (4 квартал).
- Позже модель учёта расширена (начисления charge vs распределения allocation, сверки, журнал):
  225 номеров извлечены из детализаций, Т2 скорректировано до стоимости услуг (+26,67),
  Уфанет разнесён помесячно (сентябрь + октябрь). Итог действующих начислений: 378 529,20 ₽.

## История (контекст)

До 2026-10-01 сервис `cvdoghs` на VPS отсутствовал (удалён, остались только DNS и TLS-запись
в `/data/coolify/proxy/acme.json`), данные старого инстанса утрачены. Backend пересоздан с нуля,
засидирован. Доменов фронта два (`doghs`, `dogovor`), оба ведут на этот VPS.
