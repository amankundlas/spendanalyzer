import { ReactNode } from "react";

/**
 * Page header. `greeting` renders the large warm welcome (Overview);
 * otherwise `title` renders a standard page title. `right` holds filters/actions.
 */
export default function PageHeader({
  title,
  greeting,
  subtitle,
  right,
}: {
  title?: ReactNode;
  greeting?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {greeting ? (
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{greeting}</h1>
        ) : (
          <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{title}</h2>
        )}
        {subtitle && <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2.5">{right}</div>}
    </div>
  );
}
