# Deploy на Coolify

Этот проект использует Vite (фронтенд) и Convex (бекенд). Для деплоя на Coolify нужно настроить переменные окружения для фронта и отдельно для Convex.

## 1) Frontend в Coolify (вариант с Dockerfile)

Этот вариант позволяет собирать Vite внутри Coolify и не хранить `dist` в репозитории.

### Что нужно в репозитории

- `Dockerfile` (в корне)
- `nginx.conf` (в корне)

### Настройки в Coolify

1. Build Pack: **Dockerfile**
2. Base Directory: `/`
3. Укажите переменную для сборки:
   - Build Arg `VITE_CONVEX_URL` = URL вашего Convex (например `https://<deployment>.convex.cloud`)

Важно: `VITE_CONVEX_URL` читается на этапе сборки. Runtime-переменные не влияют на уже собранную статику.

## 2) Convex внутри Coolify

Convex разворачивается как отдельный сервис в Coolify. Укажите для него домен/URL и используйте этот URL в `VITE_CONVEX_URL` на фронте.

### Опциональная переменная

- `REQUIRE_AUTH=true` — включает обязательную авторизацию на сервере (логика в `convex/_lib/flags.ts`).

Устанавливается в Environment Variables сервиса Convex в Coolify.

## 3) Что НЕ нужно в Coolify

- `CONVEX_DEPLOYMENT` — используется только локально для `npx convex dev` / `convex deploy`. В продакшне не требуется.

## 4) Проверка после деплоя

- Откройте приложение: баннер о не настроенном бэкенде не должен появляться.
- Если есть баннер, проверьте `VITE_CONVEX_URL` и что значение доступно на build-этапе.

## Полезные файлы

- `src/lib/backend/client.ts` — читает `VITE_CONVEX_URL`.
- `.env.local` — локальные dev-переменные (не используются на сервере).
- `convex/_lib/flags.ts` — флаг `REQUIRE_AUTH`.
