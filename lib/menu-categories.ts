export const menuCategories = [
  { id: "set", label: "セット" }, { id: "coffee", label: "コーヒー" },
  { id: "tea", label: "ティー・その他" }, { id: "frozen", label: "フローズン" },
  { id: "seasonal", label: "期間限定" }, { id: "pizza", label: "ピザ" },
  { id: "pasta", label: "パスタ" }, { id: "food", label: "フード" },
];

export function categoriesFor(products: { category: string }[]) {
  const labels = new Map(menuCategories.map(({ id, label }) => [id, label]));
  for (const { category } of products) if (!labels.has(category)) labels.set(category, category);
  return [...labels].map(([id, label]) => ({ id, label }));
}
