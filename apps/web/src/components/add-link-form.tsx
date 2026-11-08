import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';
import { createItemSchema, shortTitle, type ItemRow } from '@cb/shared';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import { useCreateItem } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type FormIn = z.input<typeof createItemSchema>;
type FormOut = z.output<typeof createItemSchema>;

export function AddLinkForm() {
  const [details, setDetails] = useState(false);
  const create = useCreateItem();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { url: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const item = await create.mutateAsync(values);
      toast.success(`Cooling: ${shortTitle(item.title ?? item.url)}`);
      form.reset({ url: '' });
      setDetails(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const item = (err.body as { item?: ItemRow }).item;
        toast.info(`Already on your list${item?.title ? `: ${shortTitle(item.title)}` : ''}`);
        form.reset({ url: '' });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not save that link');
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <Label htmlFor="url" className="sr-only">
        Product link
      </Label>
      <div className="flex gap-2">
        <Input
          id="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a product link"
          aria-invalid={!!errors.url}
          className="h-11 bg-card text-base"
          {...form.register('url')}
        />
        <Button type="submit" className="h-11 px-5" disabled={create.isPending}>
          {create.isPending ? <LoaderCircle className="animate-spin" /> : null}
          {create.isPending ? 'Saving' : 'Cool it'}
        </Button>
      </div>
      {errors.url && <p className="text-sm text-destructive">{errors.url.message}</p>}

      {details ? (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="price">Price</Label>
            <Input id="price" inputMode="decimal" placeholder="2999" className="bg-card" {...form.register('price', { setValueAs: (v) => (v === '' ? undefined : v) })} />
            {errors.price && <p className="text-sm text-destructive">Enter a number</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Why do you want it?</Label>
            <Textarea id="reason" rows={2} className="min-h-0 bg-card" {...form.register('reason')} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDetails(true)}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Add a price or a reason
        </button>
      )}
    </form>
  );
}
