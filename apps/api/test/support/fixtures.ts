import { AnswerOption, Category, Question } from "../../src/domain";

export const categories = [new Category("food", "Food"), new Category("travel", "Travel")];

/**
 * Ten questions per category, enough for a whole match in one category; option "<id>-ok" is
 * always the correct one.
 */
export const questions = categories.flatMap((category) =>
  Array.from({ length: 10 }, (_, i) => i + 1).map(
    (n) =>
      new Question(`${category.id}-${n}`, category.id, `${category.name} ${n}`, "EASY", 20_000, [
        new AnswerOption(`${category.id}-${n}-ok`, "right", true),
        new AnswerOption(`${category.id}-${n}-no`, "wrong", false),
        new AnswerOption(`${category.id}-${n}-x`, "also wrong", false),
        new AnswerOption(`${category.id}-${n}-y`, "wrong too", false),
      ]),
  ),
);
