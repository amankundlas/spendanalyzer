import { api } from "./client";

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  icon: string | null;
}

export interface CategoryCreate {
  name: string;
  color?: string;
  icon?: string | null;
  parent_id?: number | null;
}

export const listCategories = () => api<Category[]>("/categories");

export const createCategory = (body: CategoryCreate) =>
  api<Category>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateCategory = (id: number, body: Partial<CategoryCreate>) =>
  api<Category>(`/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteCategory = (id: number) =>
  api<void>(`/categories/${id}`, { method: "DELETE" });
