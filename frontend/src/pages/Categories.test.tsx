import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as categoriesApi from "../api/categories";
import * as rulesApi from "../api/rules";
import Categories from "./Categories";

vi.mock("../api/categories");
vi.mock("../api/rules");

beforeEach(() => {
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 1, name: "Groceries", parent_id: null, color: "#22c55e", icon: null },
  ]);
  vi.mocked(categoriesApi.createCategory).mockResolvedValue({
    id: 2, name: "Pets", parent_id: null, color: "#000000", icon: null,
  });
  vi.mocked(categoriesApi.deleteCategory).mockResolvedValue(undefined);
  vi.mocked(rulesApi.listRules).mockResolvedValue([]);
  vi.mocked(rulesApi.createRule).mockResolvedValue({
    id: 9, match_type: "merchant_contains", pattern: "WHOLEFDS", category_id: 1, priority: 100,
  });
  vi.mocked(rulesApi.deleteRule).mockResolvedValue(undefined);
});

test("lists categories and creates one", async () => {
  render(<Categories />);
  expect((await screen.findAllByText("Groceries"))[0]).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("New category name"), "Pets");
  await userEvent.click(screen.getByRole("button", { name: /add category/i }));
  await waitFor(() =>
    expect(vi.mocked(categoriesApi.createCategory)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pets" }),
    ),
  );
});

test("creates a rule against a category", async () => {
  render(<Categories />);
  await screen.findAllByText("Groceries");

  await userEvent.type(screen.getByLabelText("Rule pattern"), "WHOLEFDS");
  await userEvent.click(screen.getByRole("button", { name: /add rule/i }));
  await waitFor(() =>
    expect(vi.mocked(rulesApi.createRule)).toHaveBeenCalledWith(
      expect.objectContaining({ pattern: "WHOLEFDS", match_type: "merchant_contains" }),
    ),
  );
});
