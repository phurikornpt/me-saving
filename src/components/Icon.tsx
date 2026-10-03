import { isIconName, type IconName } from "@/client/icons";

/** Material Symbols glyph. `fill` switches outline -> solid (e.g. a streak that is lit). */
export function Icon({
  name,
  size = 24,
  fill = false,
  className = "",
}: {
  name: IconName | (string & {});
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  const safe = isIconName(name) ? name : "more_horiz"; // unknown stored names never render as raw text
  return (
    <span
      aria-hidden
      className={`material-symbols-rounded select-none ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}` }}
    >
      {safe}
    </span>
  );
}
