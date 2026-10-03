import { Inbox } from 'lucide-react';

export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 text-center text-muted"
      data-testid="empty-state"
    >
      <Inbox className="size-8" />
      <p>{title}</p>
      {action}
    </div>
  );
}
