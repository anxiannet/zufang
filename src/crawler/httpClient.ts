import axios, { AxiosError } from "axios";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { sleep } from "../utils/sleep";
import { randomUserAgent } from "../utils/userAgents";

export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function fetchHtml(url: string, retries = config.maxRetries): Promise<string> {
  return fetchHtmlWithStatus(url, retries).then((response) => response.html);
}

export async function fetchHtmlWithStatus(
  url: string,
  retries = config.maxRetries
): Promise<{ html: string; status: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await axios.get<string>(url, {
        timeout: config.requestTimeoutMs,
        headers: {
          "User-Agent": randomUserAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: config.baseUrl
        },
        responseType: "text",
        validateStatus: (status) => status >= 200 && status < 500
      });

      if (response.status >= 400) {
        throw new HttpStatusError(`HTTP ${response.status}`, response.status);
      }

      return { html: response.data, status: response.status };
    } catch (error) {
      lastError = error;
      const axiosError = error as AxiosError;
      logger.retry("request failed", {
        url,
        attempt,
        retries,
        reason: axiosError.message
      });

      if (attempt < retries) {
        const status = error instanceof HttpStatusError ? error.status : axiosError.response?.status;
        const rateLimitedDelay = status === 429 || status === 403 ? 8_000 * attempt : 800 * attempt;
        await sleep(rateLimitedDelay + Math.floor(Math.random() * 1_200));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}
