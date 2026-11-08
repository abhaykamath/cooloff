import { useState } from 'react';
import { Link } from 'react-router';
import { shortTitle, type ItemStatus } from '@cb/shared';
import { cn } from '@/lib/utils';
import { useItems, useStats } from '@/lib/queries';
import { formatDate, itemPrice, moneyText } from '@/lib/item';
import { ItemThumb } from '@/components/item-thumb';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';

const DECIDED = ['purchased', 'dropped', 'expired'] as const;
const FILTERS: { label: string; statuses: readonly ItemStatus[] }[] = [
  { label: 'All', statuses: DECIDED },
  { label: 'Dropped', statuses: ['dropped'] },
  { label: 'Expired', statuses: ['expired'] },
  { label: 'Bought', statuses: ['purchased'] },
];

export function HistoryPage() {
  const [filter, setFilter] = useState(0);
  const items = useItems(FILTERS[filter]!.statuses);
  const stats = useStats();
  const s = stats.data;

  return (
    <main className="space-y-8 pt-4">
      <div className="space-y-4">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">History</h1>
        {s && (
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-4">
              <dt className="text-sm text-muted-foreground">Not spent</dt>
              <dd className="mt-1 text-2xl font-bold text-glacier">{moneyText(s.saved)}</dd>
              <dd className="text-sm text-muted-foreground">
                {s.counts.dropped} dropped, {s.counts.expired} expired
              </dd>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <dt className="text-sm text-muted-foreground">Spent</dt>
              <dd className="mt-1 text-2xl font-bold">{moneyText(s.spent)}</dd>
              <dd className="text-sm text-muted-foreground">
                {s.counts.purchased} bought{s.brokeCooldown ? `, ${s.brokeCooldown} before the timer ended` : ''}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div role="tablist" aria-label="Filter history" className="flex flex-wrap gap-1 rounded-full bg-muted p-1 w-fit">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            role="tab"
            aria-selected={i === filter}
            onClick={() => setFilter(i)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              i === filter ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.isPending ? (
        <Skeleton className="h-40" />
      ) : items.isError ? (
        <p className="text-destructive">Couldn't load history. {items.error.message}</p>
      ) : items.data.length === 0 ? (
        <p className="text-muted-foreground">
          {filter === 0
            ? 'Decided items show up here: things you bought, dropped, or let expire.'
            : `No ${FILTERS[filter]!.label.toLowerCase()} items yet.`}
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {items.data.map((item) => (
            <li key={item.id}>
              <Link
                to={`/items/${item.id}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/50 sm:p-4"
              >
                <ItemThumb item={item} className="size-12 border" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-medium">{shortTitle(item.title ?? item.url)}</p>
                  <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    <StatusBadge status={item.status} early={item.broke_cooldown} />
                    {item.decided_at && <span>{formatDate(item.decided_at)}</span>}
                  </div>
                </div>
                <span className="shrink-0 font-semibold">{itemPrice(item) ?? '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
