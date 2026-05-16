type Props = {
  values: number[];
  /** Mantine theme color, e.g. "var(--mantine-color-brand-6)". */
  stroke: string;
  width?: number;
  height?: number;
  fill?: string;
};

/**
 * Minimal inline-SVG sparkline. No tooltips, no axes — just a smoothed line
 * + optional area fill, drawn from a numeric series. Renders nothing for
 * empty or all-zero input.
 */
export function Sparkline({
  values,
  stroke,
  fill,
  width = 100,
  height = 28,
}: Props) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 2) - 1;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const area = fill
    ? `${path} L${width},${height} L0,${height} Z`
    : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      aria-hidden
    >
      {area && <path d={area} fill={fill} opacity={0.18} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
