import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Feedback } from "../components/match/answer-feedback";
import { api, type QuestionView, unwrap } from "./api";

/** Server state and actions for playing one match. */
export function useMatchPlay(matchId: string) {
  const matchParam = { id: matchId };
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const match = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => unwrap(api.api.matches[":id"].$get({ param: matchParam })),
    // Only poll while waiting for the opponent; during your own turn nothing changes remotely.
    refetchInterval: (query) =>
      query.state.data?.status === "STARTED" && !query.state.data.isYourTurn ? 3000 : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["match", matchId] });

  // Showing the question starts its clock on the server. Repeating the request returns the same
  // question, so it is safe as a query; it is removed after answering to fetch the next one.
  const questionKey = ["match", matchId, "question"];
  const question = useQuery({
    queryKey: questionKey,
    queryFn: () => unwrap(api.api.matches[":id"].questions.next.$post({ param: matchParam })),
    enabled: Boolean(match.data?.current?.hasQuestionToAnswer) && !feedback,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const chooseCategory = useMutation({
    mutationFn: (categoryId: string) =>
      unwrap(api.api.matches[":id"].category.$post({ param: matchParam, json: { categoryId } })),
    onSuccess: refresh,
  });
  const answer = useMutation({
    mutationFn: (input: { question: QuestionView; optionId: string | null }) =>
      unwrap(
        api.api.matches[":id"].answers.$post({
          param: matchParam,
          json: { questionId: input.question.id, optionId: input.optionId },
        }),
      ),
    onSuccess: (result, input) => {
      setFeedback({ question: input.question, chosenOptionId: input.optionId, ...result });
      queryClient.removeQueries({ queryKey: questionKey });
      refresh();
    },
  });

  return {
    match,
    question,
    feedback,
    clearFeedback: () => setFeedback(null),
    chooseCategory,
    answer,
    error: chooseCategory.error ?? answer.error ?? question.error,
  };
}
