import { config } from "../utils/config";

export async function supabaseRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${response.statusText} ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.text();
  return body ? (JSON.parse(body) as T) : (undefined as T);
}
