/**
 * A fine guilloche band, the interlaced line pattern printed on passports and visa
 * vignettes. Built once on the server; purely decorative.
 */
export function Guilloche({ className }: { className?: string }) {
  const width = 1200;
  const height = 48;
  const paths: string[] = [];
  for (let k = 0; k < 7; k++) {
    const phase = (k * Math.PI) / 7;
    const amp = 14 + (k % 3) * 4;
    let d = "";
    for (let x = 0; x <= width; x += 8) {
      const y = height / 2 + amp * Math.sin(x / 38 + phase) * Math.cos(x / 151 - phase / 2);
      d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
    }
    paths.push(d);
  }
  return (
    <svg aria-hidden viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
