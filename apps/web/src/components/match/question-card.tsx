import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { ProgressBar } from "primereact/progressbar";
import { useEffect, useRef, useState } from "react";
import type { QuestionView } from "../../lib/api";

interface Props {
  question: QuestionView;
  disabled: boolean;
  /** `optionId` is null when the time ran out. The server measures the time needed. */
  onAnswer: (optionId: string | null) => void;
}

const TICK_MS = 100;

export function QuestionCard({ question, disabled, onAnswer }: Props) {
  // The clock may already be running on the server, e.g. after a reload.
  const startedAtMs = useRef(performance.now() - (question.timeLimitMs - question.remainingMs));
  const hasAnsweredRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(() => performance.now() - startedAtMs.current);

  const submit = (optionId: string | null) => {
    if (hasAnsweredRef.current) return;
    hasAnsweredRef.current = true;
    onAnswer(optionId);
  };

  useEffect(() => {
    const intervalId = setInterval(
      () => setElapsedMs(performance.now() - startedAtMs.current),
      TICK_MS,
    );
    return () => clearInterval(intervalId);
  }, []);

  const isTimeUp = elapsedMs >= question.timeLimitMs;
  // biome-ignore lint/correctness/useExhaustiveDependencies: submit only once when the time is up
  useEffect(() => {
    if (isTimeUp) submit(null);
  }, [isTimeUp]);

  const remainingPercent = Math.max(0, 100 - (elapsedMs / question.timeLimitMs) * 100);

  return (
    <Card title={question.text}>
      <ProgressBar value={remainingPercent} showValue={false} style={{ height: "0.5rem" }} />
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {question.options.map((option) => (
          <Button
            key={option.id}
            label={option.text}
            outlined
            disabled={disabled || isTimeUp}
            onClick={() => submit(option.id)}
          />
        ))}
      </div>
    </Card>
  );
}
