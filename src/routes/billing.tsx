import { createFileRoute, redirect } from "@tanstack/react-router";

// Billing now lives inside the Clients page.
export const Route = createFileRoute("/billing")({
  beforeLoad: () => { throw redirect({ to: "/clients" }); },
});
