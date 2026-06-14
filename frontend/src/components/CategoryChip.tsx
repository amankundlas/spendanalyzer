export default function CategoryChip({
  name,
  color,
}: {
  name: string | null;
  color?: string | null;
}) {
  if (!name) {
    return <span className="text-xs text-slate-400">Uncategorized</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color ?? "#64748b"}22`, color: color ?? "#475569" }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? "#64748b" }} />
      {name}
    </span>
  );
}
