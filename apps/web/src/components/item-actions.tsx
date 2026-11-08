import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Ellipsis } from 'lucide-react';
import { shortTitle, type Decision, type ItemRow } from '@cb/shared';
import { useDecide } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function useDecision(item: ItemRow) {
  const decide = useDecide();
  const name = shortTitle(item.title ?? item.url, 40);
  return {
    pending: decide.isPending,
    run: (decision: Decision, brokeCooldown?: boolean) =>
      decide.mutate(
        { id: item.id, decision, brokeCooldown },
        {
          onSuccess: () => toast.success(decision === 'dropped' ? `Dropped ${name}` : `Marked ${name} as bought`),
          onError: (err) => toast.error(err.message),
        },
      ),
  };
}

/** Buy / Drop for an unlocked (or expired) item. Drop is the primary action on purpose. */
export function DecideButtons({ item, className }: { item: ItemRow; className?: string }) {
  const { run, pending } = useDecision(item);
  return (
    <div className={className ?? 'flex gap-2'}>
      <Button onClick={() => run('dropped')} disabled={pending} className="flex-1 sm:flex-none">
        Drop it
      </Button>
      <Button variant="outline" onClick={() => run('purchased')} disabled={pending} className="flex-1 sm:flex-none">
        Buy it
      </Button>
    </div>
  );
}

/** Confirmation for buying before the timer ends — friction is the whole point. */
export function BoughtAnywayDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ItemRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run } = useDecision(item);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bought it before the cool-down ended?</AlertDialogTitle>
          <AlertDialogDescription>
            {shortTitle(item.title ?? item.url)} will move to your history as bought early. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it cooling</AlertDialogCancel>
          <AlertDialogAction onClick={() => run('purchased', true)}>Mark as bought</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Overflow menu on a cooling item: drop early, admit an early purchase, or open details. */
export function CoolingMenu({ item }: { item: ItemRow }) {
  const { run } = useDecision(item);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" className="text-muted-foreground">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run('dropped')}>Drop it now</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm(true)}>I bought it anyway</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to={`/items/${item.id}`}>Edit details</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <BoughtAnywayDialog item={item} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}
