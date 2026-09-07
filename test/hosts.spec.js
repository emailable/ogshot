import { describe, expect, it } from "vitest";
import { isAllowedHost } from "../src/hosts.js";

describe("isAllowedHost", () => {
  it("matches exact hosts, case-insensitively, ignoring whitespace", () => {
    expect(isAllowedHost("example.com", " Example.com , other.dev")).toBe(true);
    expect(isAllowedHost("other.dev", "example.com,other.dev")).toBe(true);
    expect(isAllowedHost("evil.com", "example.com")).toBe(false);
  });

  it("matches wildcard subdomains but not the apex", () => {
    expect(isAllowedHost("blogshot.example.com", "*.example.com")).toBe(true);
    expect(isAllowedHost("a.b.example.com", "*.example.com")).toBe(true);
    expect(isAllowedHost("example.com", "*.example.com")).toBe(false);
    expect(isAllowedHost("notexample.com", "*.example.com")).toBe(false);
  });

  it("denies everything when the list is empty", () => {
    expect(isAllowedHost("example.com", "")).toBe(false);
    expect(isAllowedHost("example.com", undefined)).toBe(false);
  });
});
