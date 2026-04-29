import { Hono } from "hono";

const app = new Hono();

app.use("*", async (c, next) => {
  const proto = c.req.header("x-forwarded-proto");
  console.log("[mw] before: proto=", proto, "url=", c.req.url);
  if (proto === "https" && c.req.url.startsWith("http://")) {
    const httpsUrl = "https://" + c.req.url.slice(7);
    const newReq = new Request(httpsUrl, c.req.raw);
    Object.defineProperty(c.req, "raw", { value: newReq });
    console.log("[mw] after defineProperty: c.req.url=", c.req.url, "c.req.raw.url=", c.req.raw.url);
  }
  return next();
});

app.get("/launches/recent", (c) => {
  console.log("[handler] c.req.url=", c.req.url);
  return c.json({ url: c.req.url });
});

const req = new Request("http://oracle-production-d5ba.up.railway.app/launches/recent", {
  headers: { "x-forwarded-proto": "https" },
});

const res = await app.fetch(req);
const body = await res.json();
console.log("RESULT:", body);
console.log("EXPECTED: https://oracle-production-d5ba.up.railway.app/launches/recent");
console.log("PASS:", body.url === "https://oracle-production-d5ba.up.railway.app/launches/recent");
