import { Button } from "primereact/button";
import { Message } from "primereact/message";

/** Shown when data could not be loaded, with a way to try again. */
export function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Message severity="error" text={error.message} />
      <Button label="Try again" icon="pi pi-refresh" size="small" outlined onClick={onRetry} />
    </div>
  );
}
