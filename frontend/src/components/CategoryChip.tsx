export default function CategoryChip({
  name,
  color,
}: {
  name: string | null;
  color?: string | null;
}) {
  if (!name) {
    return <span className="text-xs font-semibold text-muted">Uncategorized</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: `${color ?? "#64748b"}22`, color: color ?? "#475569" }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? "#64748b" }} />
      {name}
    </span>
  );
}
