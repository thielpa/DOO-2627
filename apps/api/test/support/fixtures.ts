import { AnswerOption, Category, Question } from "../../src/domain";

export const categories = [new Category("food", "Food"), new Category("travel", "Travel")];

/** Four questions per category; option "<id>-ok" is always the correct one. */
export const questions = categories.flatMap((category) =>
  [1, 2, 3, 4].map(
    (n) =>
      new Question(`${category.id}-${n}`, category.id, `${category.name} ${n}`, "EASY", 20_000, [
        new AnswerOption(`${category.id}-${n}-ok`, "right", true),
        new AnswerOption(`${category.id}-${n}-no`, "wrong", false),
        new AnswerOption(`${category.id}-${n}-x`, "also wrong", false),
        new AnswerOption(`${category.id}-${n}-y`, "wrong too", false),
      ]),
  ),
);
