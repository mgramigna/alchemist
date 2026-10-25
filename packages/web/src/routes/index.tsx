import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Every story starts with a little alchemy.</h1>
      <p>Open a shared Script link to see its Characters and Author Credit.</p>
    </section>
  );
}
