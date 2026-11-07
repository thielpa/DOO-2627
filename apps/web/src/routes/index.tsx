import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Tag } from "primereact/tag";
import { api } from "../lib/api";

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

  return (
    <section className="flex flex-col gap-4">
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
    </section>
  );
}
