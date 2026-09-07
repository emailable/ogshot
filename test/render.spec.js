import { describe, expect, it } from "vitest";
import { sameSite } from "../src/render.js";

describe("sameSite", () => {
  it("treats subdomains of the target as first-party", () => {
    expect(sameSite("cdn.example.com", "www.example.com")).toBe(true);
    expect(sameSite("example.com", "deploy-preview-1.dp.example.com")).toBe(true);
  });

  it("treats other domains as third-party", () => {
    expect(sameSite("js.hs-scripts.com", "example.com")).toBe(false);
    expect(sameSite("challenges.cloudflare.com", "example.com")).toBe(false);
  });
});
