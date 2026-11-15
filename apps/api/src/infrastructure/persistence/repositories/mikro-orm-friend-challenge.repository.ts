import type { EntityManager } from "@mikro-orm/postgresql";
import { LockMode, UniqueConstraintViolationException } from "@mikro-orm/core";
import { DomainError, FriendChallenge, type FriendChallengeRepository } from "../../../domain";

export const PENDING_FRIEND_CHALLENGE_UNIQUE_INDEX = "friend_challenge_pending_pair_unique";

export class MikroOrmFriendChallengeRepository implements FriendChallengeRepository {
  constructor(private readonly em: EntityManager) {}

  byId(id: string): Promise<FriendChallenge | null> {
    return this.em.findOne(FriendChallenge, { _id: id } as object);
  }

  byIdForUpdate(id: string): Promise<FriendChallenge | null> {
    return this.em.findOne(FriendChallenge, { _id: id } as object, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
    });
  }

  pendingBetween(
    challengerPlayerId: string,
    challengedPlayerId: string,
  ): Promise<FriendChallenge | null> {
    return this.em.findOne(FriendChallenge, {
      _challengerPlayerId: challengerPlayerId,
      _challengedPlayerId: challengedPlayerId,
      _status: "PENDING",
    } as object);
  }

  pendingForChallenged(playerId: string): Promise<FriendChallenge[]> {
    return this.em.find(
      FriendChallenge,
      { _challengedPlayerId: playerId, _status: "PENDING" } as object,
      { orderBy: { _createdAt: "asc" } as object },
    );
  }

  forChallenger(playerId: string): Promise<FriendChallenge[]> {
    return this.em.find(
      FriendChallenge,
      { _challengerPlayerId: playerId } as object,
      { orderBy: { _createdAt: "desc" } as object },
    );
  }

  async save(challenge: FriendChallenge): Promise<void> {
    try {
      await this.em.persist(challenge).flush();
    } catch (error) {
      if (
        error instanceof UniqueConstraintViolationException &&
        (error as UniqueConstraintViolationException & { constraint?: unknown }).constraint ===
          PENDING_FRIEND_CHALLENGE_UNIQUE_INDEX
      ) {
        throw new DomainError("CONFLICT", "A pending challenge already exists");
      }
      throw error;
    }
  }
}
