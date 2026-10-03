"use client";

/** A colour swatch that opens the browser's colour picker. 44px square so it is easy to hit. */
export function ColourField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  /** #RRGGBB */
  value: string;
  onChange: (colour: string) => void;
  className?: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      title={label}
      value={value.toLowerCase()}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      className={`size-11 shrink-0 cursor-pointer rounded-md border border-rule bg-field p-1 ${className}`}
    />
  );
}
