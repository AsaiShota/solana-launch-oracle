import { Hono } from "hono";
import { listSourceStatus } from "../../db/client";

const router = new Hono();

router.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "solana-launch-oracle",
    build: "https-fwd-2",
    time: new Date().toISOString(),
  }),
);

router.get("/sources/status", (c) => {
  const rows = listSourceStatus();
  return c.json({
    time: new Date().toISOString(),
    sources: rows.map((r) => ({
      source: r.source,
      state: r.state,
      last_event_at: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
      last_error: r.last_error,
      updated_at: new Date(r.updated_at).toISOString(),
    })),
  });
});

export default router;
