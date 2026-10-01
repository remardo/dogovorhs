# Deploy на Coolify

Этот проект использует Vite (фронтенд) и Convex (бекенд). Для деплоя на Coolify нужно настроить переменные окружения для фронта и отдельно для Convex (self-hosted).

## 1) Frontend в Coolify (вариант с Dockerfile)

Этот вариант позволяет собирать Vite внутри Coolify и не хранить `dist` в репозитории.

### Что нужно в репозитории

- `Dockerfile` (в корне)
- `nginx.conf` (в корне)

### Настройки в Coolify

1. Build Pack: **Dockerfile**
2. Base Directory: `/`
3. Укажите переменную для сборки:
   - Build Arg `VITE_CONVEX_URL` = публичный URL вашего Convex (например `https://convex.your-domain.tld`)

Важно: `VITE_CONVEX_URL` читается на этапе сборки. Runtime-переменные не влияют на уже собранную статику.

## 2) Convex self-hosted внутри Coolify

Convex разворачивается как отдельный сервис в Coolify. Укажите для него домен/URL и используйте этот URL в `VITE_CONVEX_URL` на фронте.

Минимально нужно:
1. Развернуть Convex self-hosted как отдельный сервис (по официальной инструкции Convex).
2. Получить публичный URL для клиента (его ставим в `VITE_CONVEX_URL`).
3. Сохранить admin key для деплоя функций (используется только для `convex deploy`).

### Переменные окружения Convex сервиса

- `REQUIRE_AUTH=true` - включает обязательную авторизацию на сервере (логика в `convex/_lib/flags.ts`).

Устанавливается в Environment Variables сервиса Convex в Coolify.

## 3) Деплой функций в self-hosted Convex

Для выката функций Convex используйте CLI с переменными окружения:

```sh
# PowerShell
$env:CONVEX_SELF_HOSTED_URL="https://convex-admin.your-domain.tld"
$env:CONVEX_SELF_HOSTED_ADMIN_KEY="self-hosted-convex|..."
npx convex deploy
```

Эти переменные должны храниться в секретах (не в репозитории). Их можно задать локально или в CI/CD.

## 4) Что НЕ нужно в Coolify

- `CONVEX_DEPLOYMENT` - используется только локально для `npx convex dev` / `convex deploy`. В продакшне не требуется.

## 5) Проверка после деплоя
- Откройте приложение: баннер о не настроенном бэкенде не должен появляться.

- Если есть баннер, проверьте `VITE_CONVEX_URL` и что значение доступно на build-этапе.

## Полезные файлы

- `src/lib/backend/client.ts` - читает `VITE_CONVEX_URL`.
- `.env.local` - локальные dev-переменные (не используются на сервере).
- `convex/_lib/flags.ts` - флаг `REQUIRE_AUTH`.
