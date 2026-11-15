import { AnswerOption, Question } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const AnswerOptionSchema = privateStateSchema(AnswerOption, {
  embeddable: true,
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    isCorrect: { type: "boolean" },
  },
});

export const QuestionSchema = privateStateSchema(Question, {
  tableName: "question",
  properties: {
    id: { type: "string", primary: true },
    categoryId: { type: "string", index: true },
    text: { type: "string" },
    difficulty: { type: "string" },
    timeLimitMs: { type: "integer" },
    options: { kind: "embedded", entity: () => AnswerOption, array: true },
  },
});
