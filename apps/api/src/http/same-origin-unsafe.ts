import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Requires explicit same-origin proof for unsafe methods; fetch metadata alone is insufficient. */
export const requireSameOriginForUnsafeMethods = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method.toUpperCase())) return next();

  const expectedOrigin = new URL(c.req.url).origin;
  const suppliedOrigin = c.req.header("origin");
  const sourceOrigin = suppliedOrigin
    ? originOf(suppliedOrigin)
    : originOf(c.req.header("referer"));

  // Reject opaque/invalid origins and unsafe requests without Origin or Referer.
  if (!sourceOrigin || sourceOrigin !== expectedOrigin) {
    throw new HTTPException(403, { message: "Cross-origin request rejected" });
  }

  await next();
});
