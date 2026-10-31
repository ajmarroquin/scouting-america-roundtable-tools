/** A plain progress bar toward a goal; 100% is the goal. */
export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Kpi({ label, value, detail, progress }: { label: string; value: string; detail?: React.ReactNode; progress?: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {progress !== undefined && <Progress value={progress} label={label} />}
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}
