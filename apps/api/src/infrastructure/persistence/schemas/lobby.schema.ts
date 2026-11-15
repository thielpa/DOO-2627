import { Lobby } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const LobbySchema = privateStateSchema(Lobby, {
  tableName: "lobby",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _mode: { type: "string", fieldName: "mode" },
    _status: { type: "string", fieldName: "status", index: true },
    _players: { type: "string[]", fieldName: "players" },
    _createdAt: { type: "datetime", fieldName: "created_at" },
    _matchId: { type: "uuid", fieldName: "match_id", nullable: true },
  },
});
