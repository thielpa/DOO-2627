import { Player } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const PlayerSchema = privateStateSchema(Player, {
  tableName: "player",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _username: { type: "string", fieldName: "username", unique: true },
    _passwordHash: { type: "string", fieldName: "password_hash" },
  },
});
