import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { hostnameOf } from '@/lib/url';
import { timeLeft, type ItemRow } from '@cb/shared';
import { useDeleteItem, useItem, useUpdateItem } from '@/lib/queries';
import { coolProgress, DEFAULT_CURRENCY, formatDate, itemPrice } from '@/lib/item';
import { useNow } from '@/hooks/use-now';
import { HeatBar } from '@/components/heat-bar';
import { ItemThumb } from '@/components/item-thumb';
import { StatusBadge } from '@/components/status-badge';
import { BoughtAnywayDialog, DecideButtons } from '@/components/item-actions';
import { useDecide } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ItemPage() {
  const { id = '' } = useParams();
  const item = useItem(id);

  return (
    <main className="space-y-8 pt-2">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>
      {item.isPending ? (
        <Skeleton className="h-64" />
      ) : item.isError ? (
        <p className="text-destructive">
          {item.error.message === 'Not found' ? 'This item no longer exists.' : item.error.message}
        </p>
      ) : (
        <ItemDetail item={item.data} />
      )}
    </main>
  );
}

function ItemDetail({ item }: { item: ItemRow }) {
  const now = useNow();
  const price = itemPrice(item);

  return (
    <>
      <section className="flex flex-col gap-5 sm:flex-row">
        {item.image_url && <ItemThumb item={item} className="aspect-square w-full border sm:w-44" />}
        <div className="min-w-0 flex-1 space-y-3">
          <StatusBadge status={item.status} early={item.broke_cooldown} />
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-pretty">{item.title ?? item.url}</h1>
          {price && <p className="text-3xl font-extrabold tracking-tight">{price}</p>}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View on {item.site_name ?? hostnameOf(item.url)}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </section>

      <StatusPanel item={item} now={now} />
      <EditForm item={item} />
      <Timeline item={item} />
      <DeleteItem item={item} />
    </>
  );
}

function StatusPanel({ item, now }: { item: ItemRow; now: number }) {
  const decide = useDecide();
  const [confirm, setConfirm] = useState(false);

  if (item.status === 'cooling') {
    const progress = coolProgress(item, now);
    return (
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <p className="font-medium">
          {progress >= 1 ? (
            'Unlocking soon'
          ) : (
            <>
              Unlocks in <span className="tabular-nums">{timeLeft(item.unlocks_at, now)}</span>
            </>
          )}
          <span className="font-normal text-muted-foreground">, {formatDate(item.unlocks_at)}</span>
        </p>
        <HeatBar progress={progress} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            onClick={() =>
              decide.mutate(
                { id: item.id, decision: 'dropped' },
                { onSuccess: () => toast.success('Dropped'), onError: (e) => toast.error(e.message) },
              )
            }
            disabled={decide.isPending}
          >
            Drop it now
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            I bought it anyway
          </Button>
        </div>
        <BoughtAnywayDialog item={item} open={confirm} onOpenChange={setConfirm} />
      </section>
    );
  }

  if (item.status === 'unlocked' || item.status === 'expired') {
    return (
      <section className="space-y-3 rounded-2xl border border-glacier/40 bg-card p-4">
        <p className="font-medium">
          {item.status === 'unlocked'
            ? 'The cool-down is over. Still want it?'
            : 'This expired without a decision, so it counts as not spent. You can still record what happened.'}
        </p>
        <DecideButtons item={item} />
      </section>
    );
  }

  return null;
}

const editSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  price: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), 'Enter a number, like 2999'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter code, like INR'),
  reason: z.string().trim().max(500),
});
type EditValues = z.infer<typeof editSchema>;

function toValues(item: ItemRow): EditValues {
  return {
    title: item.title ?? '',
    price: item.price == null ? '' : String(item.price),
    currency: item.currency ?? DEFAULT_CURRENCY,
    reason: item.reason ?? '',
  };
}

function EditForm({ item }: { item: ItemRow }) {
  const update = useUpdateItem(item.id);
  const form = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: toValues(item) });
  const { errors, isDirty } = form.formState;

  // Keep the form in sync when the item refreshes in the background (e.g. edited from Telegram),
  // but never clobber unsaved typing.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(toValues(item));
  }, [item, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await update.mutateAsync({
        title: v.title,
        price: v.price === '' ? null : Number(v.price),
        currency: v.currency.toUpperCase(),
        reason: v.reason === '' ? null : v.reason,
      });
      form.reset(toValues(saved));
      toast.success('Changes saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save changes');
    }
  });

  return (
    <section className="space-y-4" aria-labelledby="details">
      <h2 id="details" className="text-xl font-bold tracking-tight">
        Details
      </h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Title" id="title" error={errors.title?.message}>
          <Input id="title" className="bg-card" aria-invalid={!!errors.title} {...form.register('title')} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Price" id="price" error={errors.price?.message}>
            <Input
              id="price"
              inputMode="decimal"
              placeholder="Unknown"
              className="bg-card"
              aria-invalid={!!errors.price}
              {...form.register('price')}
            />
          </Field>
          <Field label="Currency" id="currency" error={errors.currency?.message}>
            <Input
              id="currency"
              maxLength={3}
              className="bg-card uppercase"
              aria-invalid={!!errors.currency}
              {...form.register('currency')}
            />
          </Field>
        </div>
        <Field label="Why do you want it?" id="reason" error={errors.reason?.message}>
          <Textarea id="reason" rows={3} className="bg-card" {...form.register('reason')} />
        </Field>
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending && <LoaderCircle className="animate-spin" />}
          Save changes
        </Button>
      </form>
    </section>
  );
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Timeline({ item }: { item: ItemRow }) {
  const decidedLabel =
    item.status === 'purchased' ? 'Bought' : item.status === 'dropped' ? 'Dropped' : 'Expired';
  type Event = { label: string; at: string; note?: string; upcoming?: boolean };
  const candidates: (Event | null)[] = [
    { label: 'Saved', at: item.created_at, note: item.source === 'telegram' ? 'from Telegram' : 'from the dashboard' },
    item.unlocked_at
      ? { label: 'Cool-down ended', at: item.unlocked_at }
      : item.status === 'cooling'
        ? { label: 'Cool-down ends', at: item.unlocks_at, upcoming: true }
        : null,
    item.decided_at ? { label: decidedLabel, at: item.decided_at } : null,
  ];
  const events = candidates.filter((e): e is Event => e !== null);

  return (
    <section className="space-y-4" aria-labelledby="timeline">
      <h2 id="timeline" className="text-xl font-bold tracking-tight">
        Timeline
      </h2>
      <ol className="space-y-3 border-l-2 pl-5">
        {events.map((e) => (
          <li key={e.label} className="relative">
            <span
              className={`absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full ring-4 ring-background ${e.upcoming ? 'border-2 border-muted-foreground bg-background' : 'bg-foreground'}`}
              aria-hidden
            />
            <p className="font-medium">
              {e.label}
              {e.note && <span className="font-normal text-muted-foreground"> {e.note}</span>}
            </p>
            <p className="text-sm text-muted-foreground">{formatDate(e.at)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeleteItem({ item }: { item: ItemRow }) {
  const del = useDeleteItem();
  const navigate = useNavigate();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 />
          Delete item
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this item?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this for links saved by mistake. It's removed from your history and totals, and can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() =>
              del.mutate(item.id, {
                onSuccess: () => {
                  toast.success('Item deleted');
                  navigate('/', { replace: true });
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Delete item
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
