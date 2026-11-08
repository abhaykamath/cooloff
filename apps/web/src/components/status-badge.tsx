import { Ban, Hourglass, Lock, LockOpen, ShoppingBag } from 'lucide-react';
import type { ItemStatus } from '@cb/shared';
import { cn } from '@/lib/utils';

const META: Record<ItemStatus, { label: string; icon: typeof Lock; className: string }> = {
  cooling: { label: 'Cooling', icon: Lock, className: 'text-ember' },
  unlocked: { label: 'Ready to decide', icon: LockOpen, className: 'text-glacier' },
  purchased: { label: 'Bought', icon: ShoppingBag, className: 'text-foreground' },
  dropped: { label: 'Dropped', icon: Ban, className: 'text-glacier' },
  expired: { label: 'Expired', icon: Hourglass, className: 'text-glacier' },
};

export function StatusBadge({ status, early, className }: { status: ItemStatus; early?: boolean; className?: string }) {
  const { label, icon: Icon, className: tone } = META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', tone, className)}>
      <Icon className="size-4" aria-hidden />
      {label}
      {early && status === 'purchased' && <span className="font-normal text-muted-foreground">(early)</span>}
    </span>
  );
}
