import { Player } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const PlayerSchema = privateStateSchema(Player, {
  tableName: "player",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _username: { type: "string", fieldName: "username" },
    _passwordHash: { type: "string", fieldName: "password_hash" },
  },
  uniques: [
    {
      name: "player_username_lower_unique",
      expression:
        'create unique index "player_username_lower_unique" on "player" (lower("username"))',
    },
  ],
});
