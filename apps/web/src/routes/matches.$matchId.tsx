import { createFileRoute, Link } from "@tanstack/react-router";
import { Message } from "primereact/message";
import { MatchStage } from "../components/match/match-stage";
import { MatchStatusTag } from "../components/match/match-status-tag";
import { RoundOverview } from "../components/match/round-overview";
import { useMatchPlay } from "../lib/use-match-play";

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchPage,
});

function MatchPage() {
  const { matchId } = Route.useParams();
  const { match, question, feedback, clearFeedback, chooseCategory, answer, error } =
    useMatchPlay(matchId);

  if (match.isPending) return <p>Loading…</p>;
  if (match.isError) return <Message severity="error" text={match.error.message} />;
  const view = match.data;
  // Scores stay hidden while you pick a category or answer, so they don't distract or pressure.
  const areResultsVisible =
    !feedback && !view.current?.categories && !view.current?.hasQuestionToAnswer;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-indigo-600 underline">
          ← My matches
        </Link>
        <MatchStatusTag match={view} />
      </div>

      {areResultsVisible && (
        <p className="text-center text-2xl">
          You <strong>{view.yourScore}</strong> : <strong>{view.opponentScore}</strong> Opponent
        </p>
      )}

      {error && <Message severity="error" text={error.message} />}

      <MatchStage
        view={view}
        feedback={feedback}
        question={question.data}
        isBusy={chooseCategory.isPending || answer.isPending}
        onNext={clearFeedback}
        onChooseCategory={(categoryId) => chooseCategory.mutate(categoryId)}
        onAnswer={(q, optionId) => answer.mutate({ question: q, optionId })}
      />

      {areResultsVisible && <RoundOverview rounds={view.rounds} />}
    </section>
  );
}
