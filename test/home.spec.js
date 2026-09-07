import { describe, expect, it } from "vitest";
import { homePage } from "../src/home.js";

describe("homePage", () => {
  it("uses the first exact allowed host in examples", () => {
    const html = homePage({ mode: "worker", origin: "https://og.example.com", allowedHosts: "*.example.com,example.com" });
    expect(html).toContain("https://og.example.com/render?url=https%3A%2F%2Fexample.com%2Fposts%2F1");
    expect(html).toContain('placeholder="https://example.com/posts/1"');
  });

  it("turns a wildcard into a www host when there is no exact host", () => {
    const html = homePage({ mode: "worker", origin: "https://og.example.com", allowedHosts: "*.example.com" });
    expect(html).toContain("https%3A%2F%2Fwww.example.com%2Fposts%2F1");
  });

  it("warns when no hosts are configured", () => {
    expect(homePage({ mode: "worker", origin: "https://og.example.com" })).toContain("none configured");
  });

  it("shows the deploy button instead of the form in static mode", () => {
    const html = homePage({ mode: "static" });
    expect(html).toContain("deploy.workers.cloudflare.com");
    expect(html).not.toContain('id="try"');
    expect(html).toContain("https://og.example.com/render?url=https%3A%2F%2Fexample.com%2Fposts%2F1");
  });
});
