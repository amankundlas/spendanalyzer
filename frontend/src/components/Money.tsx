const FMT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(amount: number): string {
  return FMT.format(amount);
}

export default function Money({ amount }: { amount: number }) {
  const negative = amount < 0;
  return (
    <span className={negative ? "text-rose-600" : "text-emerald-700"}>
      {formatMoney(amount)}
    </span>
  );
}
