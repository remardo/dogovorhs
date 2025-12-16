import { AlertTriangle, CloudOff, Database } from "lucide-react";
import { useBackendHealth } from "@/lib/backend";

export default function BackendStatusBanner() {
  const health = useBackendHealth();

  if (health.status === "online") return null;

  if (health.status === "checking") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <Database className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Проверка подключения к бэкенду…</div>
          <div className="text-muted-foreground">Если проверка зависла, проверьте `VITE_CONVEX_URL`.</div>
        </div>
      </div>
    );
  }

  if (health.status === "demo") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
        <div>
          <div className="font-medium">Демо-режим</div>
          <div className="text-muted-foreground">
            Бэкенд не настроен: переменная `VITE_CONVEX_URL` не задана. Данные не сохраняются в облако.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <CloudOff className="mt-0.5 h-4 w-4 text-destructive" />
      <div>
        <div className="font-medium">Нет связи с бэкендом</div>
        <div className="text-muted-foreground">
          Приложение откатится на демо-данные при ошибках. Проверьте доступность Convex и `VITE_CONVEX_URL`.
        </div>
      </div>
    </div>
  );
}

