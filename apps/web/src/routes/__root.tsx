import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { logoutPlayer, restorePlayerSession } from "../lib/auth";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    let player: Awaited<ReturnType<typeof restorePlayerSession>>;
    try {
      player = await restorePlayerSession();
    } catch {
      return {
        player: null,
        restoreError: "We couldn't check your session. Check your connection and try again.",
      };
    }
    if (!player && location.pathname !== "/login") {
      throw redirect({ to: "/login" });
    }
    if (player && location.pathname === "/login") {
      throw redirect({ to: "/" });
    }
    return { player, restoreError: null };
  },
  component: RootLayout,
});

function RootLayout() {
  const { player, restoreError } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: logoutPlayer,
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await navigate({ to: "/login", replace: true });
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      {restoreError ? (
        <section role="alert" className="mx-auto flex max-w-md flex-col gap-4 py-12">
          <Message severity="error" text={restoreError} />
          <Button label="Retry" onClick={() => router.invalidate()} />
        </section>
      ) : (
        <>
          {player && (
            <header className="mb-8 flex items-center justify-between border-b border-gray-200 pb-4">
              <Link to="/" className="text-lg font-semibold text-indigo-700">
                Languageduel
              </Link>
              <div className="flex items-center gap-3">
                <span>{player.username}</span>
                <Button
                  label="Log out"
                  severity="secondary"
                  outlined
                  size="small"
                  loading={logout.isPending}
                  onClick={() => logout.mutate()}
                />
              </div>
            </header>
          )}
          {logout.isError && (
            <Message severity="error" text={logout.error.message} className="mb-4 w-full" />
          )}
          <Outlet />
        </>
      )}
    </main>
  );
}
