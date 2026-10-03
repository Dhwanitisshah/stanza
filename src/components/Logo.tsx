export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-baseline gap-3">
      <span className="font-serif text-[2rem] italic leading-none">Stanza</span>
      {!compact && <span className="eyebrow hidden sm:inline">Your poem, performed</span>}
    </span>
  );
}
