import { Button } from "primereact/button";

interface Props {
  roundNumber: number;
  categories: { id: string; name: string }[];
  disabled: boolean;
  onChoose: (categoryId: string) => void;
}

export function CategoryPicker({ roundNumber, categories, disabled, onChoose }: Props) {
  return (
    <div className="flex flex-col items-center gap-4">
      <h2 className="text-xl font-semibold">Round {roundNumber}: choose a category</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {categories.map((category) => (
          <Button
            key={category.id}
            label={category.name}
            outlined
            disabled={disabled}
            onClick={() => onChoose(category.id)}
          />
        ))}
      </div>
    </div>
  );
}
