import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Message } from "primereact/message";
import { ProgressSpinner } from "primereact/progressspinner";
import { useEffect } from "react";
import { api, unwrap } from "../lib/api";

export const Route = createFileRoute("/lobby/$lobbyId")({
  component: LobbyPage,
});

function LobbyPage() {
  const { lobbyId } = Route.useParams();
  const navigate = useNavigate();
  const lobby = useQuery({
    queryKey: ["lobby", lobbyId],
    queryFn: () => unwrap(api.api.matchmaking.lobbies[":id"].$get({ param: { id: lobbyId } })),
    refetchInterval: 2000,
  });
  const matchId = lobby.data?.matchId;

  useEffect(() => {
    if (matchId) navigate({ to: "/matches/$matchId", params: { matchId }, replace: true });
  }, [matchId, navigate]);

  return (
    <section className="flex flex-col items-center gap-4 py-12 text-center">
      {lobby.isError ? (
        <Message severity="error" text={lobby.error.message} />
      ) : (
        <>
          <ProgressSpinner style={{ width: "3rem", height: "3rem" }} />
          <p className="text-lg">Searching for an opponent…</p>
          <p className="text-sm text-gray-500">
            You can leave this page; the match will show up in your list.
          </p>
        </>
      )}
      <Link to="/" className="text-indigo-600 underline">
        Back to my matches
      </Link>
    </section>
  );
}
