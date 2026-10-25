import { createFileRoute } from "@tanstack/react-router";

// Public Script view (#19). Replace the placeholder with the Script read.
export const Route = createFileRoute("/scripts/$scriptId")({
  component: PublicScript,
});

function PublicScript() {
  const { scriptId } = Route.useParams();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Script {scriptId}</h1>
    </section>
  );
}
