import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// This app is one HTML file plus a client-side router, so every URL below the
// root has to be answered by serving that one file and letting React Router
// read the path. Without it the site works on a first visit and 404s on every
// refresh, bookmark and shared link, which is the shape of failure nobody
// notices until someone reloads.
//
// It is not testable in jsdom or by a local build: the rule lives in the
// host's routing, and the only proof is a request to the deployed site. What
// this file can do is hold the config to the shape that was verified against
// the real host, so the combination that broke it cannot come back quietly.
const config = JSON.parse(
  readFileSync(join(resolve(__dirname, ".."), "vercel.json"), "utf8"),
);

describe("the hosting config", () => {
  it("sends every unmatched path to the single page", () => {
    expect(config.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  // The first deploy carried "cleanUrls": true alongside that rewrite, and
  // every sub-path returned NOT_FOUND. cleanUrls strips .html from URLs and
  // redirects /index.html to /, so the rewrite's own destination stopped
  // resolving and the fallback never fired. It buys a one-page app nothing
  // and it silently disables the line above, so it stays out.
  it("does not strip .html, which would break that rewrite's destination", () => {
    expect(config.cleanUrls).toBeUndefined();
  });

  it("builds the app's own output, not the old site's", () => {
    expect(config.outputDirectory).toBe("dist");
    expect(config.buildCommand).toBe("npm run build");
  });

  // Transcribed by hand rather than read back out of the same object.
  it("sets the three response headers the deploy was checked against", () => {
    const sent = Object.fromEntries(
      config.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );

    expect(sent).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    expect(config.headers[0].source).toBe("/(.*)");
  });
});
