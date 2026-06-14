import { useEffect, useState } from "react";
import {
  Category,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../api/categories";
import { MatchType, Rule, createRule, deleteRule, listRules } from "../api/rules";
import CategoryChip from "../components/CategoryChip";

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#64748b");
  const [matchType, setMatchType] = useState<MatchType>("merchant_contains");
  const [pattern, setPattern] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<number | "">("");

  const refresh = async () => {
    try {
      const [cats, rls] = await Promise.all([listCategories(), listRules()]);
      setCategories(cats);
      setRules(rls);
      setRuleCategoryId((prev) => (prev === "" && cats.length ? cats[0].id : prev));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const categoryFor = (id: number) => categories.find((c) => c.id === id);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createCategory({ name: catName, color: catColor });
      setCatName("");
      setCatColor("#64748b");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (ruleCategoryId === "") return;
    try {
      await createRule({ match_type: matchType, pattern, category_id: ruleCategoryId });
      setPattern("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const recolor = async (id: number, color: string) => {
    try {
      await updateCategory(id, { color });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeCategory = async (id: number) => {
    try {
      await deleteCategory(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeRule = async (id: number) => {
    try {
      await deleteRule(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="flex-1 p-8">
      <h2 className="text-2xl font-semibold mb-6">Categories &amp; Rules</h2>
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <section className="mb-10">
        <h3 className="mb-3 font-medium">Categories</h3>
        <form onSubmit={addCategory} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            Name
            <input
              aria-label="New category name"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col">
            Color
            <input
              aria-label="New category color"
              type="color"
              className="mt-1 h-8 w-12 rounded border border-slate-300"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
            Add category
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1"
            >
              <CategoryChip name={c.name} color={c.color} />
              <input
                aria-label={`Color for ${c.name}`}
                type="color"
                className="h-5 w-5 border-0 bg-transparent p-0"
                value={c.color}
                onChange={(e) => recolor(c.id, e.target.value)}
              />
              <button
                className="text-xs text-slate-400 hover:text-rose-600"
                aria-label={`Delete category ${c.name}`}
                onClick={() => removeCategory(c.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-medium">Rules</h3>
        <p className="mb-3 text-sm text-slate-500">
          Rules auto-assign a category to matching transactions on import. Lower priority number wins.
        </p>
        <form onSubmit={addRule} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">
            Match
            <select
              aria-label="Rule match type"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as MatchType)}
            >
              <option value="merchant_contains">merchant contains</option>
              <option value="regex">regex</option>
            </select>
          </label>
          <label className="flex flex-col">
            Pattern
            <input
              aria-label="Rule pattern"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col">
            Category
            <select
              aria-label="Rule category"
              className="mt-1 rounded border border-slate-300 px-2 py-1"
              value={ruleCategoryId}
              onChange={(e) => setRuleCategoryId(e.target.value ? Number(e.target.value) : "")}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700">
            Add rule
          </button>
        </form>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th scope="col" className="py-1">Match</th>
              <th scope="col">Pattern</th>
              <th scope="col">Category</th>
              <th scope="col">Priority</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const c = categoryFor(r.category_id);
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-1">{r.match_type}</td>
                  <td className="font-mono">{r.pattern}</td>
                  <td>
                    <CategoryChip name={c?.name ?? null} color={c?.color} />
                  </td>
                  <td>{r.priority}</td>
                  <td className="text-right">
                    <button
                      className="text-xs text-slate-400 hover:text-rose-600"
                      aria-label={`Delete rule ${r.pattern}`}
                      onClick={() => removeRule(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-slate-400">
                  No rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
