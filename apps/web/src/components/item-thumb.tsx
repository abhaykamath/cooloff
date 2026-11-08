import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import type { ItemRow } from '@cb/shared';
import { cn } from '@/lib/utils';

export function ItemThumb({ item, className }: { item: ItemRow; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg bg-white', className)}>
      {item.image_url && !broken ? (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-contain p-1"
        />
      ) : (
        <ShoppingBag className="size-1/3 text-[#9aa8b3]" aria-hidden />
      )}
    </div>
  );
}
