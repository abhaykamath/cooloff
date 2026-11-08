import { Link } from 'react-router';
import { shortTitle, timeLeft, type ItemRow } from '@cb/shared';
import { useItems, useStats } from '@/lib/queries';
import { coolProgress, itemPrice, moneyText } from '@/lib/item';
import { useNow } from '@/hooks/use-now';
import { AddLinkForm } from '@/components/add-link-form';
import { HeatBar } from '@/components/heat-bar';
import { ItemThumb } from '@/components/item-thumb';
import { CoolingMenu, DecideButtons } from '@/components/item-actions';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE = ['cooling', 'unlocked'] as const;

export function HomePage() {
  const items = useItems(ACTIVE);
  const stats = useStats();
  const now = useNow();

  const unlocked = items.data?.filter((i) => i.status === 'unlocked') ?? [];
  const cooling = (items.data?.filter((i) => i.status === 'cooling') ?? []).sort((a, b) =>
    a.unlocks_at.localeCompare(b.unlocks_at),
  );

  return (
    <main className="space-y-12">
      <section className="space-y-6 pt-4">
        <div className="space-y-2">
          {stats.data ? (
            <h1 className="text-[clamp(2.5rem,9vw,4.25rem)] leading-[0.95] font-extrabold tracking-[-0.035em] text-balance">
              {moneyText(stats.data.saved)} not spent.
            </h1>
          ) : (
            <Skeleton className="h-16 w-3/4" />
          )}
          {stats.data && <Summary stats={stats.data} />}
        </div>
        <AddLinkForm />
      </section>

      {items.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.isError ? (
        <p className="text-destructive">Couldn't load your items. {items.error.message}</p>
      ) : (
        <>
          {unlocked.length > 0 && (
            <section className="space-y-4" aria-labelledby="ready">
              <h2 id="ready" className="text-xl font-bold tracking-tight">
                Ready to decide
              </h2>
              <div className="space-y-3">
                {unlocked.map((item) => (
                  <DecideTile key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4" aria-labelledby="cooling">
            <h2 id="cooling" className="text-xl font-bold tracking-tight">
              Cooling down
            </h2>
            {cooling.length ? (
              <ul className="divide-y rounded-2xl border bg-card">
                {cooling.map((item) => (
                  <CoolingRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            ) : (
              <p className="max-w-prose text-muted-foreground">
                Nothing cooling. Next time you're about to add something to your cart, paste the link above or share it
                to the Telegram bot instead.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Summary({ stats }: { stats: NonNullable<ReturnType<typeof useStats>['data']> }) {
  const walkedAway = stats.counts.dropped + stats.counts.expired;
  const lines: string[] = [];
  if (walkedAway) lines.push(`You walked away from ${walkedAway} ${walkedAway === 1 ? 'thing' : 'things'}.`);
  else lines.push('Every link you drop instead of buying adds up here.');
  if (stats.unpriced) lines.push(`${stats.unpriced} without a price ${stats.unpriced === 1 ? "isn't" : "aren't"} counted.`);
  return <p className="text-muted-foreground">{lines.join(' ')}</p>;
}

function DecideTile({ item }: { item: ItemRow }) {
  const price = itemPrice(item);
  return (
    <article className="rounded-2xl border border-glacier/40 bg-card p-4 shadow-[0_1px_0_0_var(--glacier)]">
      <div className="flex gap-4">
        <ItemThumb item={item} className="size-20 border sm:size-24" />
        <div className="min-w-0 flex-1 space-y-1">
          <Link to={`/items/${item.id}`} className="line-clamp-2 font-semibold hover:underline">
            {shortTitle(item.title ?? item.url, 90)}
          </Link>
          {price && <p className="text-lg font-bold">{price}</p>}
          {item.reason && <p className="text-sm text-muted-foreground">You said “{item.reason}”</p>}
        </div>
      </div>
      <DecideButtons item={item} className="mt-4 flex gap-2" />
    </article>
  );
}

function CoolingRow({ item, now }: { item: ItemRow; now: number }) {
  const price = itemPrice(item);
  const progress = coolProgress(item, now);
  const done = progress >= 1;
  return (
    <li className="flex gap-3 p-3 sm:p-4">
      <ItemThumb item={item} className="size-14 border" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-2">
          <Link to={`/items/${item.id}`} className="min-w-0 flex-1 hover:underline">
            <span className="line-clamp-1 font-medium">{shortTitle(item.title ?? item.url)}</span>
          </Link>
          <CoolingMenu item={item} />
        </div>
        <HeatBar progress={progress} />
        <div className="flex items-baseline justify-between gap-2 text-sm">
          {price ? (
            <span className="font-semibold">{price}</span>
          ) : (
            <Link to={`/items/${item.id}`} className="text-muted-foreground underline underline-offset-4">
              Add price
            </Link>
          )}
          <span className="text-muted-foreground tabular-nums">
            {done ? 'Unlocking soon' : `${timeLeft(item.unlocks_at, now)} left`}
          </span>
        </div>
      </div>
    </li>
  );
}
