import { Button } from "@/components/ui/button";

export function LoadingBlock({ text = "Загрузка…" }: { text?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground" role="status">
      {text}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm" role="alert">
      <div className="font-medium">Не удалось загрузить данные</div>
      <div className="mt-1 text-muted-foreground">{message}</div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({ text = "Нет записей" }: { text?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
