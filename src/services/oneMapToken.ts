let cached_token: string | null = null;
let cached_expires_at_ms = 0;

export async function getOneMapAccessToken(): Promise<string> {
  const manual_token = process.env.ONEMAP_API_TOKEN ?? process.env.ONEMAP_TOKEN;
  if (manual_token) return manual_token;
  if (cached_token && Date.now() < cached_expires_at_ms) return cached_token;

  const email = process.env.ONEMAP_EMAIL;
  const password = process.env.ONEMAP_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing ONEMAP_API_TOKEN or ONEMAP_EMAIL / ONEMAP_PASSWORD");
  }

  const response = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`OneMap token request failed: HTTP ${response.status}`);

  const payload = await response.json();
  const token = String(payload?.access_token ?? "").trim();
  if (!token) throw new Error("OneMap token response missing access_token");

  cached_token = token;
  const expiry_timestamp = Number(payload?.expiry_timestamp);
  cached_expires_at_ms = Number.isFinite(expiry_timestamp)
    ? expiry_timestamp * 1000 - 10 * 60 * 1000
    : Date.now() + 60 * 60 * 1000;
  return token;
}
