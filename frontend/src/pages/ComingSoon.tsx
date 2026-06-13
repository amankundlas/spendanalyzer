export default function ComingSoon({ title }: { title: string }) {
  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <p className="text-slate-500">This section is coming in a later phase.</p>
    </main>
  );
}
