import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import { type FormEvent, useState } from "react";
import { loginPlayer } from "../lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const router = useRouter();
  const login = useMutation({
    mutationFn: () => loginPlayer(username, password),
    onSuccess: async () => {
      await router.invalidate();
      await navigate({ to: "/", replace: true });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 py-12">
      <div>
        <h1 className="text-3xl font-bold">Welcome to Languageduel</h1>
        <p className="mt-2 text-gray-600">
          Log in or create your player with a username and password.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <label htmlFor="username">Username</label>
          <InputText
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="password">Password</label>
          <Password
            inputId="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            feedback={false}
            toggleMask
            required
          />
        </div>

        {login.isError && <Message severity="error" text={login.error.message} />}
        <Button type="submit" label="Continue" loading={login.isPending} />
      </form>
    </section>
  );
}
