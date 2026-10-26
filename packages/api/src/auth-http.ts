import { Context, Effect } from "effect";
import { Auth, FLOW_SECONDS, SESSION_SECONDS } from "./auth.ts";

export const SESSION_COOKIE = "__Host-alchemist-session";
export const FLOW_COOKIE = "__Host-alchemist-login";

export const cookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`;

export const readCookie = (request: Request, name: string): string | null => {
  const matches = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));

  // Reject duplicate cookies rather than choosing one from a different scope.
  return matches.length === 1 ? (matches[0]?.slice(name.length + 1) ?? null) : null;
};

export class BrowserSession extends Context.Service<
  BrowserSession,
  { readonly token: string | null }
>()("alchemist/BrowserSession") {}

export const sameOrigin = (request: Request, origin: string) =>
  request.headers.get("Origin") === origin &&
  [null, "same-origin", "none"].includes(request.headers.get("Sec-Fetch-Site"));

export const authResponse = (body: string | null, status: number, extra?: HeadersInit) => {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(body, { status, headers });
};

export const handleAuth = Effect.fn("AuthHttp.handle")(function* (request: Request) {
  const auth = yield* Auth;
  const url = new URL(request.url);

  if (url.pathname === "/auth/google" && request.method === "GET") {
    const flow = yield* auth.start();

    return authResponse(null, 303, {
      Location: flow.url,
      "Set-Cookie": cookie(FLOW_COOKIE, flow.browser, FLOW_SECONDS),
    });
  }

  if (url.pathname === "/auth/google/callback" && request.method === "GET") {
    const clearFlow = cookie(FLOW_COOKIE, "", 0);
    const state = url.searchParams.getAll("state");
    const code = url.searchParams.getAll("code");
    const browser = readCookie(request, FLOW_COOKIE);

    if (
      url.searchParams.has("error") ||
      state.length !== 1 ||
      code.length !== 1 ||
      browser === null
    )
      return authResponse("Sign-in failed. Return home and try again.", 400, {
        "Set-Cookie": clearFlow,
      });

    const token = yield* auth
      .callback(state[0] ?? "", browser, code[0] ?? "")
      .pipe(Effect.match({ onFailure: () => null, onSuccess: (value) => value }));

    if (token === null)
      return authResponse("Sign-in failed. Return home and try again.", 400, {
        "Set-Cookie": clearFlow,
      });
    const headers = new Headers({ Location: "/" });
    headers.append("Set-Cookie", clearFlow);
    headers.append("Set-Cookie", cookie(SESSION_COOKIE, token, SESSION_SECONDS));

    return authResponse(null, 303, headers);
  }

  if (url.pathname === "/auth/sign-out" && request.method === "POST") {
    yield* auth.signOut(readCookie(request, SESSION_COOKIE));

    return authResponse(null, 303, { Location: "/", "Set-Cookie": cookie(SESSION_COOKIE, "", 0) });
  }

  return authResponse("Not found", 404);
});
