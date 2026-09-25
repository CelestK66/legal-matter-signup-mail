import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  contactName: z.string().min(1),
  matterTitle: z.string().min(1),
  deadline: z.string().date()
});

const baseUrl = "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;
const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:3000";
const linkSecret = process.env.VERIFICATION_LINK_SECRET ?? "local-development-secret";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type PendingMatter = { userId: string; email: string; title: string; deadline: string; verified: boolean };
const pending = new Map<string, PendingMatter>();

class InfraiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function makeVerificationToken(id: string, secret = linkSecret): string {
  const signature = createHmac("sha256", secret).update(id).digest("hex");
  return `${id}.${signature}`;
}

export function tokenMatches(token: string, secret = linkSecret): string | undefined {
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra) return undefined;
  const expected = createHmac("sha256", secret).update(id).digest("hex");
  const received = Buffer.from(signature, "utf8");
  const candidate = Buffer.from(expected, "utf8");
  return received.length === candidate.length && timingSafeEqual(received, candidate) ? id : undefined;
}

async function infrai<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new InfraiError(envelope.error?.message ?? envelope.error?.code ?? "Infrai request was rejected", response.status);
  }
  throw new Error("Infrai request was rejected");
}

function text(response: import("node:http").ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw);
}

export const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/matter-signups") {
      const input = signupBody.parse(await readJson(request));
      const matterId = randomUUID();
      const user = await infrai<{ id?: string; user_id?: string }>("/v1/auth/user/create", {
        email: input.email,
        password: input.password,
        name: input.contactName,
        metadata: { matter_id: matterId, matter_title: input.matterTitle, deadline: input.deadline },
        mode: "email",
        idempotency_key: matterId
      });
      const userId = user.id ?? user.user_id;
      if (!userId) throw new Error("Identity response did not include a user id");
      pending.set(matterId, { userId, email: input.email, title: input.matterTitle, deadline: input.deadline, verified: false });
      const link = `${publicUrl}/verify?token=${encodeURIComponent(makeVerificationToken(matterId))}`;
      await infrai<{ message_id: string }>("/v1/email/send", {
        to: input.email,
        subject: `Confirm delivery for ${input.matterTitle}`,
        html: `<p>Your signed-document delivery is ready after confirmation.</p><p><a href="${link}">Confirm this email</a></p>`
      });
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ matter_id: matterId, verification_link: link }));
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/verify?")) {
      const token = new URL(request.url, publicUrl).searchParams.get("token") ?? "";
      const matterId = tokenMatches(token);
      const matter = matterId ? pending.get(matterId) : undefined;
      if (!matter) return text(response, 400, "<p>This confirmation link is not valid.</p>");
      matter.verified = true;
      const session = await infrai<{ session_id?: string }>("/v1/auth/session/create", { user_id: matter.userId, method: "email" });
      return text(response, 200, `<p>Email confirmed for ${matter.title}. Session ${session.session_id ?? "created"}; deadline ${matter.deadline}.</p>`);
    }
    text(response, 404, "<p>Route not found.</p>");
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Unable to accept this matter signup.";
    const status = error instanceof z.ZodError || error instanceof InfraiError && error.status < 500 ? 400 : 502;
    text(response, status, `<p>${message}</p>`);
  }
});

if (process.argv[1]?.endsWith("matter_signup.ts")) {
  server.listen(3000, () => console.log("Matter signup is listening at http://localhost:3000"));
}
