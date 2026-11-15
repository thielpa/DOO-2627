import { FriendChallenge } from "../../../domain";
import { privateStateSchema } from "./private-state";

export const FriendChallengeSchema = privateStateSchema(FriendChallenge, {
  tableName: "friend_challenge",
  properties: {
    _id: { type: "uuid", primary: true, fieldName: "id" },
    _challengerPlayerId: { type: "uuid", fieldName: "challenger_player_id" },
    _challengedPlayerId: { type: "uuid", fieldName: "challenged_player_id" },
    _status: { type: "string", fieldName: "status" },
    _createdAt: { type: "datetime", fieldName: "created_at" },
    _respondedAt: { type: "datetime", fieldName: "responded_at", nullable: true },
  },
  indexes: [
    {
      name: "friend_challenge_incoming_status_index",
      properties: ["_challengedPlayerId", "_status"],
    },
    {
      name: "friend_challenge_outgoing_created_index",
      properties: ["_challengerPlayerId", "_createdAt"],
    },
  ],
  uniques: [
    {
      name: "friend_challenge_pending_pair_unique",
      properties: ["_challengerPlayerId", "_challengedPlayerId"],
      where: { _status: "PENDING" },
    },
  ],
});
