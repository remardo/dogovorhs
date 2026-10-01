import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  onReset?: () => void;
  resetLabel?: string;
};
type State = { message: string | null };

/** Catches reactive-query failures (Convex useQuery throws to a boundary). */
export default class QueryErrorBoundary extends React.Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(err: unknown): State {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    console.error("Query failed", err);
  }

  private retry = () => this.setState({ message: null });

  render() {
    if (this.state.message) {
      return (
        <div className="p-6">
          <div
            className="mx-auto max-w-xl rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm"
            role="alert"
          >
            <div className="font-medium">Не удалось загрузить данные</div>
            <div className="mt-1 text-muted-foreground">
              Проверьте подключение к серверу и повторите попытку.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={this.retry}>
                Повторить
              </Button>
              {this.props.onReset && (
                <Button variant="ghost" size="sm" onClick={this.props.onReset}>
                  {this.props.resetLabel ?? "На главную"}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
