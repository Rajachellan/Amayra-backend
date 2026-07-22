import xss from "xss";

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return xss(value.trim(), xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/password|token|secret|authorization/i.test(key) && typeof nested === "string") {
        out[key] = nested;
        continue;
      }
      out[key] = sanitizeValue(nested);
    }
    return out;
  }
  return value;
}

/** Deep-sanitize request body / query / params strings against XSS. */
export function sanitizeRequestPayload<T>(payload: T): T {
  return sanitizeValue(payload) as T;
}
