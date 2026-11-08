import { cn } from '@/lib/utils';

/**
 * The cool-down thermometer: a track that fills as the 48h pass, its tip shifting
 * from ember (just saved, hot) to glacier (cooled down).
 */
export function HeatBar({ progress, className }: { progress: number; className?: string }) {
  const pct = Math.round(progress * 100);
  const tip = `color-mix(in oklab, var(--glacier) ${pct}%, var(--ember))`;
  return (
    <div
      role="progressbar"
      aria-label="Cool-down progress"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(pct, 3)}%`, background: `linear-gradient(to right in oklab, var(--ember), ${tip})` }}
      />
    </div>
  );
}

/** Temperature colour for a progress value — used for small accents (dots, text). */
export function heatColor(progress: number): string {
  return `color-mix(in oklab, var(--glacier) ${Math.round(progress * 100)}%, var(--ember))`;
}
