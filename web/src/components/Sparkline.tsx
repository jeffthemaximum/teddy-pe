// A small line chart, drawn by hand rather than pulled in from a charting
// library. A handful of points a few times per year does not earn a
// dependency in a bundle every visitor downloads (see the privacy test in
// __tests__/bundle-privacy.test.ts, which reads everything the build
// emits).
//
// This component knows nothing about the program: it draws whatever
// {label, value} pairs it is handed, in the order it is handed them. The
// caller (Progress.tsx) decides what "in order" means for its own data
// (window order for a battery measure or height) and does the sorting
// before it gets here.
//
// Two things make this usable by more than a sighted mouse user on a wide
// screen: the SVG carries its own <title> (an accessible name a screen
// reader announces, and something Testing Library's getByTitle can find),
// and every plotted value is also written out as plain text underneath the
// line. A line alone is not something Jeff can read at a glance on his
// phone, or something a screen reader can read at all.
export interface SparklinePoint {
  label: string;
  value: number;
}

const WIDTH = 300;
const HEIGHT = 90;
const PAD_X = 12;
const PAD_Y = 12;

export function Sparkline({ title, points }: { title: string; points: SparklinePoint[] }) {
  if (points.length === 0) {
    return null;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1 ? WIDTH / 2 : PAD_X + (index / (points.length - 1)) * (WIDTH - PAD_X * 2);
    // A flat series (every value the same, or a single point) has no span
    // to divide by; it draws as a level line down the middle rather than
    // dividing by zero.
    const y = span === 0 ? HEIGHT / 2 : PAD_Y + (1 - (point.value - min) / span) * (HEIGHT - PAD_Y * 2);
    return { x, y, point };
  });

  const path = coords.map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" className="sparkline__chart">
        <title>{title}</title>
        {coords.length > 1 && <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />}
        {coords.map((c) => (
          <circle key={`${c.point.label}-${c.x}-${c.y}`} cx={c.x} cy={c.y} r={3} fill="currentColor" />
        ))}
      </svg>
      <ul className="sparkline__values" aria-label={`${title} values`}>
        {points.map((point) => (
          <li key={point.label}>
            {point.label}: {point.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
