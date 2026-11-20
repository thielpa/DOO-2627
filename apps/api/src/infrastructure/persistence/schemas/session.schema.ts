import { Session } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const SessionSchema = privateStateSchema(Session, {
  tableName: "session",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _playerId: { type: "uuid", fieldName: "player_id", index: true },
    _tokenDigest: { type: "string", fieldName: "token_digest", length: 64, unique: true },
    _expiresAt: { type: "datetime", fieldName: "expires_at" },
    _invalidatedAt: { type: "datetime", fieldName: "invalidated_at", nullable: true },
  },
});
