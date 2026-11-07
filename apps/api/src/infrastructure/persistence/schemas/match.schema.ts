import { Match, PlayerAnswer, Round } from "../../../domain";
import { privateStateSchema } from "./private-state";

// Rounds and answers belong to the Match aggregate, so they are stored inside the match row (jsonb).

export const PlayerAnswerSchema = privateStateSchema(PlayerAnswer, {
  embeddable: true,
  properties: {
    playerId: { type: "string" },
    questionId: { type: "string" },
    optionId: { type: "string", nullable: true },
    timeNeededMs: { type: "integer" },
    isCorrect: { type: "boolean" },
  },
});

export const RoundSchema = privateStateSchema(Round, {
  embeddable: true,
  properties: {
    number: { type: "integer" },
    chooserId: { type: "string" },
    _status: { type: "string", fieldName: "status" },
    _categoryId: { type: "string", fieldName: "categoryId", nullable: true },
    _questionIds: { type: "json", fieldName: "questionIds" },
    _shownAt: { type: "datetime", fieldName: "shownAt", nullable: true },
    _answers: {
      kind: "embedded",
      entity: () => PlayerAnswer,
      array: true,
      fieldName: "answers",
    },
  },
});

export const MatchSchema = privateStateSchema(Match, {
  tableName: "match",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _mode: { type: "string", fieldName: "mode" },
    _difficulty: { type: "string", fieldName: "difficulty" },
    _status: { type: "string", fieldName: "status" },
    _players: { type: "string[]", fieldName: "players" },
    _rounds: { kind: "embedded", entity: () => Round, array: true, fieldName: "rounds" },
    _startedAt: { type: "datetime", fieldName: "started_at", nullable: true },
  },
});
