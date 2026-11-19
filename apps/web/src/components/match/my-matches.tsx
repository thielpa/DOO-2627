import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "primereact/skeleton";
import type { ReactNode } from "react";
import { api, type MatchSummary, unwrap } from "../../lib/api";
import { LoadError } from "../load-error";
import { MatchStatusTag, TurnTimeLeft } from "./match-status-tag";

/** Running matches first: those waiting for you, the most urgent on top. */
function byUrgency(a: MatchSummary, b: MatchSummary): number {
  if (a.isYourTurn !== b.isYourTurn) return a.isYourTurn ? -1 : 1;
  return (a.turnDeadline ?? "").localeCompare(b.turnDeadline ?? "");
}

export function MyMatches() {
  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: () => unwrap(api.api.matches.$get()),
    refetchInterval: 5000,
  });

  if (matches.isPending) {
    return (
      <MatchSection title="My matches">
        <div role="status" aria-label="Loading matches" className="flex flex-col gap-2">
          <Skeleton height="3.25rem" />
          <Skeleton height="3.25rem" />
        </div>
      </MatchSection>
    );
  }
  if (matches.isError) {
    return (
      <MatchSection title="My matches">
        <LoadError error={matches.error} onRetry={() => matches.refetch()} />
      </MatchSection>
    );
  }
  if (matches.data.length === 0) {
    return (
      <MatchSection title="My matches">
        <p className="text-gray-500">No matches yet. Start one above!</p>
      </MatchSection>
    );
  }

  const running = matches.data.filter((m) => m.status === "STARTED").sort(byUrgency);
  // The API lists them newest first.
  const finished = matches.data.filter((m) => m.status !== "STARTED");
  return (
    <>
      {running.length > 0 && <MatchSection title="Running" matches={running} />}
      {finished.length > 0 && <MatchSection title="Finished" matches={finished} />}
    </>
  );
}

function MatchSection({
  title,
  matches,
  children,
}: {
  title: string;
  matches?: MatchSummary[];
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
      {matches && (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
              <MatchListItem match={match} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchListItem({ match }: { match: MatchSummary }) {
  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-3 hover:bg-gray-50"
    >
      <span>
        You <strong>{match.yourScore}</strong> : <strong>{match.opponentScore}</strong> Opponent
        {match.startedAt && (
          <span className="ml-3 text-sm text-gray-500">
            {new Date(match.startedAt).toLocaleString()}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {match.isYourTurn && <TurnTimeLeft match={match} />}
        <MatchStatusTag match={match} />
      </span>
    </Link>
  );
}
