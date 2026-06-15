const FMT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(amount: number): string {
  return FMT.format(amount);
}

export default function Money({ amount }: { amount: number }) {
  const negative = amount < 0;
  return (
    <span className={`tabnum font-semibold ${negative ? "text-spend" : "text-ok"}`}>
      {formatMoney(amount)}
    </span>
  );
}
