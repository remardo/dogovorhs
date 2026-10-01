# Договор HS — учёт договоров связи

Внутренний сервис для учёта договоров связи, SIM-карт, сотрудников, тарифов и расходов на телекоммуникации.

## Стек

- Vite + TypeScript (strict) + React 18 + React Router
- shadcn-ui + Tailwind CSS
- Convex (бэкенд: компании, сотрудники, договоры, SIM, тарифы, расходы, импорт биллинга)
- Vitest + Testing Library, ESLint, Husky (pre-commit: lint + typecheck + test)

## Быстрый старт

```sh
npm ci
npm run convex:dev   # в одном терминале (нужен вход в Convex CLI)
npm run dev          # в другом: http://localhost:8080
```

Без `VITE_CONVEX_URL` фронтенд работает в демо-режиме (пустые данные + баннер), при появлении URL переключается на Convex.

## Переменные окружения

Пример — в `.env.example` (закоммичен, секретов не содержит):

- `VITE_CONVEX_URL` — публичный URL Convex (читается на этапе сборки Vite).
- `CONVEX_DEPLOYMENT` — только локально для `npx convex dev`.
- `CONVEX_SELF_HOSTED_URL` / `CONVEX_SELF_HOSTED_ADMIN_KEY` — только для `convex deploy`, хранить в секретах, не коммитить.
- `REQUIRE_AUTH` — `true` включает обязательную авторизацию на сервере (`convex/_lib/flags.ts`).

## Скрипты

- `npm run dev` — dev-сервер
- `npm run build` — `typecheck + vite build`
- `npm run typecheck` — `tsc -b` (фронт) + `tsc -p convex` (бэкенд)
- `npm run lint` — eslint
- `npm test` — vitest (26 тестов: парсинг биллинга, НДС, поиск, query-параметры)
- `npm run convex:dev` / `npm run convex:deploy` — Convex CLI
- Сидирование (однократно): `npx convex run seed:run`

## Архитектура фронта

- `src/lib/backend/client.ts` — `convexClient` (null в демо-режиме), `backendAvailable`, `useBackendHealth`, реэкспорт типизированного `api`.
- `src/lib/backend/index.ts` — типизированные хуки (`api.*`, без строковых имён функций), терпимые `*Input` типы с нормализацией до серверного контракта, `isLoading`/`error`/`refresh` в каждом хуке. Дашборд опрашивается раз в 30с на видимой вкладке.
- `src/components/expenses/BillingImportDialog.tsx` — импорт биллинга (загрузка, предпросмотр, разрешение договоров/SIM/тарифов, применение). Типы — в `importTypes.ts`.
- `src/pages/Expenses.tsx` — только CRUD расходов и таблица.

## Импорт биллинга

Парсинг XLS/XLSX — `exceljs` (`convex/_lib/billingImportParser.ts`), CSV/PDF Мегафон — отдельные модули. `xlsx` удалён осознанно (заброшенная библиотека с известными уязвимостями).

## Деплой

Устройство прода и процедуры — в `INFRASTRUCTURE.md` (VPS `201.24.121.181`:
ручной Convex-контейнер + ручной nginx-контейнер, в UI Coolify их нет).
`DEPLOY_COOLIFY.md` — короткий указатель + план переезда фронта в Coolify.

## Безопасность

- Никогда не коммитить `.env.local` / `.env.coolify` (там admin-ключи) — они в `.gitignore`.
- Для продакшена выставить `REQUIRE_AUTH=true` на Convex-сервисе.
- `npm audit`: фиксы без breaking changes применены (react-router XSS закрыт). Остались dev-only предупреждения по `vite/vitest/esbuild` — лечатся только мажорным апгрейдом (vite 8 / vitest 5), отложено сознательно.
