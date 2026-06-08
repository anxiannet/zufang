let cachedToken: string | null = null;
let cachedExpiresAtMs = 0;
let pendingTokenRequest: Promise<string> | null = null;

const TOKEN_ENDPOINT = "https://www.onemap.gov.sg/api/auth/post/getToken";
const DEFAULT_TOKEN_TTL_MS = 70 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000;

export async function ensureOneMapAccessToken(): Promise<string> {
  const manualToken = process.env.ONEMAP_API_TOKEN ?? process.env.ONEMAP_TOKEN;
  if (manualToken) return manualToken;

  if (cachedToken && Date.now() < cachedExpiresAtMs) {
    return cachedToken;
  }

  if (!pendingTokenRequest) {
    pendingTokenRequest = requestOneMapToken().finally(() => {
      pendingTokenRequest = null;
    });
  }

  return pendingTokenRequest;
}

export async function ensureOneMapTokenEnv(): Promise<string> {
  const token = await ensureOneMapAccessToken();
  process.env.ONEMAP_API_TOKEN = token;
  return token;
}

export function hasOneMapCredentials(): boolean {
  return Boolean(
    process.env.ONEMAP_API_TOKEN ||
    process.env.ONEMAP_TOKEN ||
    (process.env.ONEMAP_EMAIL && process.env.ONEMAP_PASSWORD)
  );
}

async function requestOneMapToken(): Promise<string> {
  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing ONEMAP_EMAIL / ONEMAP_PASSWORD or ONEMAP_API_TOKEN / ONEMAP_TOKEN");
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "sg-chinese-rental-mvp/1.0"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OneMap token request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const token = String(data?.access_token ?? "").trim();

  if (!token) {
    throw new Error("OneMap token response missing access_token");
  }

  cachedToken = token;

  const expiryTimestamp = Number(data?.expiry_timestamp);
  if (Number.isFinite(expiryTimestamp) && expiryTimestamp > 0) {
    cachedExpiresAtMs = expiryTimestamp * 1000 - TOKEN_REFRESH_BUFFER_MS;
  } else {
    cachedExpiresAtMs = Date.now() + DEFAULT_TOKEN_TTL_MS;
  }

  return token;
}
