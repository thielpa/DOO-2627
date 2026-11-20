import { createFileRoute, Link } from "@tanstack/react-router";
import { ProgressSpinner } from "primereact/progressspinner";
import { LoadError } from "../components/load-error";
import { MatchStage } from "../components/match/match-stage";
import { MatchStatusTag, TurnTimeLeft } from "../components/match/match-status-tag";
import { RoundOverview } from "../components/match/round-overview";
import { useMatchPlay } from "../lib/use-match-play";

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchPage,
});

function MatchPage() {
  const { matchId } = Route.useParams();
  const { match, question, feedback, clearFeedback, chooseCategory, answer, error, retry } =
    useMatchPlay(matchId);

  const backLink = (
    <Link to="/" className="text-indigo-600 underline">
      ← My matches
    </Link>
  );

  if (match.isPending) {
    return (
      <section className="flex flex-col items-center gap-2 py-12" aria-busy="true">
        <ProgressSpinner style={{ width: "3rem", height: "3rem" }} />
        <p className="text-gray-600">Loading match…</p>
      </section>
    );
  }
  if (match.isError) {
    return (
      <section className="flex flex-col gap-6">
        {backLink}
        <LoadError error={match.error} onRetry={() => match.refetch()} />
      </section>
    );
  }

  const view = match.data;
  // Scores stay hidden while you pick a category or answer, so they don't distract or pressure.
  const areResultsVisible =
    !feedback && !view.current?.categories && !view.current?.hasQuestionToAnswer;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        {backLink}
        <span className="flex items-center gap-2">
          {view.isYourTurn && <TurnTimeLeft match={view} />}
          <MatchStatusTag match={view} />
        </span>
      </div>

      {areResultsVisible && (
        <p className="text-center text-2xl">
          You <strong>{view.yourScore}</strong> : <strong>{view.opponentScore}</strong> Opponent
        </p>
      )}

      {error && <LoadError error={error} onRetry={retry} />}

      <MatchStage
        view={view}
        feedback={feedback}
        question={question.data}
        isBusy={chooseCategory.isPending || answer.isPending}
        onNext={clearFeedback}
        onChooseCategory={(categoryId) => chooseCategory.mutate(categoryId)}
        onAnswer={(q, optionId, position) => answer.mutate({ question: q, optionId, position })}
      />

      {areResultsVisible && <RoundOverview rounds={view.rounds} />}
    </section>
  );
}
