/**
 * Parses a comma-separated allowlist and checks a hostname against it.
 * "example.com" matches exactly; "*.example.com" matches any subdomain (not the apex).
 *
 * @param {string} hostname
 * @param {string | undefined} allowed
 * @returns {boolean}
 */
export function isAllowedHost(hostname, allowed) {
  const host = hostname.toLowerCase();
  const patterns = (allowed ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".example.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pattern;
  });
}
