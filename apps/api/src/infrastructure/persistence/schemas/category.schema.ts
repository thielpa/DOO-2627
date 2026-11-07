import { Category } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const CategorySchema = privateStateSchema(Category, {
  tableName: "category",
  properties: {
    id: { type: "string", primary: true },
    name: { type: "string" },
  },
});
