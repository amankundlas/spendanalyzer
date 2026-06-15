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
import PageHeader from "../components/PageHeader";
import { Button, Card, CardHeader, EmptyState, Select } from "../components/ui";

const fieldClass =
  "mt-1.5 rounded-xl bg-bg px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent/50";

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
    <main>
      <PageHeader title="Categories & Rules" />
      {error && <p className="mb-4 text-sm font-semibold text-spend">{error}</p>}

      <Card className="mb-4 p-5">
        <CardHeader title="Categories" />
        <form onSubmit={addCategory} className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Name
            <input
              aria-label="New category name"
              className={`${fieldClass} w-44`}
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Color
            <input
              aria-label="New category color"
              type="color"
              className="mt-1.5 h-[42px] w-12 cursor-pointer rounded-xl bg-bg p-1 ring-1 ring-line"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
          </label>
          <Button type="submit">Add category</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl bg-bg px-2.5 py-1.5 ring-1 ring-line"
            >
              <CategoryChip name={c.name} color={c.color} />
              <input
                aria-label={`Color for ${c.name}`}
                type="color"
                className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                value={c.color}
                onChange={(e) => recolor(c.id, e.target.value)}
              />
              <button
                className="text-xs font-bold text-muted transition-colors hover:text-spend cursor-pointer"
                aria-label={`Delete category ${c.name}`}
                onClick={() => removeCategory(c.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <EmptyState>No categories yet.</EmptyState>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader
          title="Rules"
          meta="Auto-assign on import · lower priority number wins"
        />
        <form onSubmit={addRule} className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Match
            <Select
              aria-label="Rule match type"
              className="mt-1.5"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as MatchType)}
            >
              <option value="merchant_contains">merchant contains</option>
              <option value="regex">regex</option>
            </Select>
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Pattern
            <input
              aria-label="Rule pattern"
              className={`${fieldClass} w-48`}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col text-[13px] font-semibold text-ink2">
            Category
            <Select
              aria-label="Rule category"
              className="mt-1.5"
              value={ruleCategoryId}
              onChange={(e) => setRuleCategoryId(e.target.value ? Number(e.target.value) : "")}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit">Add rule</Button>
        </form>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="py-2.5 pr-3">Match</th>
              <th scope="col" className="pr-3">Pattern</th>
              <th scope="col" className="pr-3">Category</th>
              <th scope="col" className="pr-3">Priority</th>
              <th scope="col" className="text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const c = categoryFor(r.category_id);
              return (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-ink2">{r.match_type}</td>
                  <td className="pr-3 font-mono text-ink">{r.pattern}</td>
                  <td className="pr-3">
                    <CategoryChip name={c?.name ?? null} color={c?.color} />
                  </td>
                  <td className="pr-3 tabnum text-ink2">{r.priority}</td>
                  <td className="text-right">
                    <button
                      className="text-xs font-bold text-muted transition-colors hover:text-spend cursor-pointer"
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
                <td colSpan={5}>
                  <EmptyState>No rules yet.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
