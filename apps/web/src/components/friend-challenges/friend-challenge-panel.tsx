import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { api, unwrap } from "../../lib/api";

type Challenge = {
  id: string;
  challengerUsername: string;
  challengedUsername: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  respondedAt: string | null;
};

function Invitation({ challenge }: { challenge: Challenge }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-3">
      <div>
        <p>
          <strong>{challenge.challengerUsername}</strong> challenged{" "}
          <strong>{challenge.challengedUsername}</strong>
        </p>
        <p className="text-sm text-gray-500">{new Date(challenge.createdAt).toLocaleString()}</p>
      </div>
      <Tag value={challenge.status} severity={challenge.status === "PENDING" ? "warning" : "info"} />
    </div>
  );
}

export function FriendChallengePanel() {
  const [username, setUsername] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [declineSuccess, setDeclineSuccess] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const challenges = useQuery({
    queryKey: ["friend-challenges"],
    queryFn: () => unwrap(api.api["friend-challenges"].$get()),
  });
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: ["friend-challenges"] });

  const invite = useMutation({
    mutationFn: (targetUsername: string) =>
      unwrap(api.api["friend-challenges"].$post({ json: { username: targetUsername } })),
    onSuccess: async () => {
      setUsername("");
      setInviteSuccess(true);
      await refreshLists();
    },
  });
  const accept = useMutation({
    mutationFn: (challengeId: string) =>
      unwrap(api.api["friend-challenges"][":id"].accept.$post({ param: { id: challengeId } })),
    onSuccess: async (result) => {
      await Promise.all([
        refreshLists(),
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
      ]);
      await navigate({ to: "/matches/$matchId", params: { matchId: result.matchId } });
    },
  });
  const decline = useMutation({
    mutationFn: (challengeId: string) =>
      unwrap(api.api["friend-challenges"][":id"].decline.$post({ param: { id: challengeId } })),
    onSuccess: async () => {
      setDeclineSuccess(true);
      await refreshLists();
    },
  });

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteSuccess(false);
    invite.mutate(username);
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="friend-challenges-title">
      <h2 id="friend-challenges-title" className="text-xl font-semibold">Friend challenges</h2>

      <form className="flex flex-wrap items-end gap-3" onSubmit={submitInvite}>
        <div className="flex flex-col gap-2">
          <label htmlFor="challenge-username">Invite by username</label>
          <InputText
            id="challenge-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <Button type="submit" label="Send invitation" loading={invite.isPending} disabled={!username} />
      </form>
      {invite.isError && <Message severity="error" text={invite.error.message} />}
      {inviteSuccess && <Message severity="success" text="Invitation sent." />}

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Incoming invitations</h3>
        {challenges.isPending && <p>Loading invitations…</p>}
        {challenges.isError && <Message severity="error" text={challenges.error.message} />}
        {challenges.data?.incoming.length === 0 && <p className="text-gray-500">No incoming invitations.</p>}
        <ul className="flex flex-col gap-2">
          {challenges.data?.incoming.map((challenge) => (
            <li key={challenge.id} className="flex flex-col gap-2">
              <Invitation challenge={challenge} />
              {challenge.status === "PENDING" && (
                <div className="flex gap-2">
                  <Button
                    label="Accept"
                    loading={accept.isPending && accept.variables === challenge.id}
                    disabled={accept.isPending || decline.isPending}
                    onClick={() => accept.mutate(challenge.id)}
                  />
                  <Button
                    label="Decline"
                    severity="secondary"
                    outlined
                    loading={decline.isPending && decline.variables === challenge.id}
                    disabled={accept.isPending || decline.isPending}
                    onClick={() => decline.mutate(challenge.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        {accept.isError && <Message severity="error" text={accept.error.message} />}
        {decline.isError && <Message severity="error" text={decline.error.message} />}
        {declineSuccess && <Message severity="success" text="Invitation declined." />}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Outgoing invitations</h3>
        {challenges.data?.outgoing.length === 0 && <p className="text-gray-500">No outgoing invitations.</p>}
        <ul className="flex flex-col gap-2">
          {challenges.data?.outgoing.map((challenge) => (
            <li key={challenge.id}><Invitation challenge={challenge} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
