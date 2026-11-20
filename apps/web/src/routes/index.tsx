import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { FriendChallengePanel } from "../components/friend-challenges/friend-challenge-panel";
import { MyMatches } from "../components/match/my-matches";
import { api, unwrap } from "../lib/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.api.health.$get();
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      return res.json();
    },
  });
  const navigate = useNavigate();
  const search = useMutation({
    mutationFn: () => unwrap(api.api.matchmaking.search.$post()),
    onSuccess: (result) =>
      result.status === "matched"
        ? navigate({ to: "/matches/$matchId", params: { matchId: result.matchId } })
        : navigate({ to: "/lobby/$lobbyId", params: { lobbyId: result.lobbyId } }),
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Languageduel</h1>
      <p>
        API status:{" "}
        {health.isPending ? (
          <Tag value="checking" severity="info" />
        ) : health.isError ? (
          <Tag value="unreachable" severity="danger" />
        ) : (
          <Tag value={health.data.status} severity="success" />
        )}
      </p>

      <Button
        label="Play against a random player"
        icon="pi pi-play"
        loading={search.isPending}
        onClick={() => search.mutate()}
        className="self-start"
      />
      {search.isError && <Message severity="error" text={search.error.message} />}

      <FriendChallengePanel />

      <MyMatches />
    </section>
  );
}
