import { dateTime } from '@/lib/format';

export function DateChip({ iso }: { iso: string }) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-accent-soft py-1 text-accent-ink">
      <span className="text-[10px] font-semibold uppercase">{dateTime(iso, { month: 'short' }).replace('.', '')}</span>
      <span className="tabular text-lg leading-tight font-semibold">{dateTime(iso, { day: 'numeric' })}</span>
    </div>
  );
}
