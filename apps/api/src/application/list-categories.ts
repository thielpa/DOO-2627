import type { CategoryRepository } from "../domain";

export interface CategoryView {
  id: string;
  name: string;
}

export class ListCategories {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategoryView[]> {
    const categories = await this.categories.all();
    return categories.map(({ id, name }) => ({ id, name }));
  }
}
