# Deploy

> Фактическое устройство прода: см. `INFRASTRUCTURE.md`. Коротко: на VPS всё поднято
> **вручную через Docker** (в UI Coolify ресурсов DogovorHS нет), этот файл — про процедуры.

## Backend (Convex self-hosted)

Процедура деплоя функций, проверки и сида — в `INFRASTRUCTURE.md` (разделы
«Деплой функций Convex», «Проверка и сид», «Admin-ключ»).

Кратко: спрятать `.env.local` (иначе CLI ругается на конфликт `CONVEX_DEPLOYMENT`),
подставить переменные из `.env.coolify`, `npx convex deploy --yes`, вернуть файл.

## Frontend

Процедура — в `INFRASTRUCTURE.md` (раздел «Деплой фронта»).
Ключевое: собирать с `$env:VITE_CONVEX_URL="https://cvdoghs.sorokintech.ru"`
(`.env.local` содержит dev-URL, который иначе вшьётся в бандл), после `scp`
делать `chmod -R a+rX` (иначе nginx отдаёт 403).

В репозитории лежат `Dockerfile` + `nginx.conf` под **будущий** переезд фронта
в Coolify как Dockerfile-приложение (build-arg `VITE_CONVEX_URL`). Пока переезд
не выполнен — фронт деплоится вручную (см. выше), `Dockerfile` в проде не используется.

## Если мигрировать в Coolify UI

1. Создать приложение из репозитория (Build Pack: Dockerfile, Base Directory `/`),
   build-arg `VITE_CONVEX_URL=https://cvdoghs.sorokintech.ru`, домен `doghs.sorokintech.ru`.
2. Backend оставить как есть (ручной контейнер) либо пересоздать сервисом в UI
   и перевыпустить admin-ключ.
3. Обновить `INFRASTRUCTURE.md` и удалить этот абзац.
