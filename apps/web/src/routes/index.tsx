import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { MatchStatusTag } from "../components/match/match-status-tag";
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
  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: () => unwrap(api.api.matches.$get()),
    refetchInterval: 5000,
  });
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

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">My matches</h2>
        {matches.isPending && <p>Loading…</p>}
        {matches.isError && <Message severity="error" text={matches.error.message} />}
        {matches.data?.length === 0 && <p className="text-gray-500">No matches yet.</p>}
        <ul className="flex flex-col gap-2">
          {matches.data?.map((match) => (
            <li key={match.id}>
              <Link
                to="/matches/$matchId"
                params={{ matchId: match.id }}
                className="flex items-center justify-between rounded border border-gray-200 p-3 hover:bg-gray-50"
              >
                <span>
                  You <strong>{match.yourScore}</strong> : <strong>{match.opponentScore}</strong>{" "}
                  Opponent
                  {match.startedAt && (
                    <span className="ml-3 text-sm text-gray-500">
                      {new Date(match.startedAt).toLocaleString()}
                    </span>
                  )}
                </span>
                <MatchStatusTag match={match} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
