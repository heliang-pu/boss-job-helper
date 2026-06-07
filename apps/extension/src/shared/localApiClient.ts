import type { JobPosting, MatchResult, ResumeProfile, SearchPreference } from "@job-apply-assistant/shared-schema";

/* ---------- types ---------- */

export interface HealthResponse {
  status: "ok";
  service: "job-apply-assistant-local-service";
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds?: number;
}

export type MatchPayload = {
  job: JobPosting;
  resume: ResumeProfile;
  preference: SearchPreference;
  aiConfig: Required<AiConfig>;
};

type FetchLike = typeof fetch;

/* ---------- Service Worker proxy (for JSON requests that fail from popup/content) ---------- */

function sendToBackground<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && typeof response === "object" && "error" in (response as Record<string, unknown>)) {
        reject(new Error((response as { error: string }).error));
        return;
      }
      resolve(response as T);
    });
  });
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): Promise<T> {
  const response = init === undefined ? await fetchImpl(url) : await fetchImpl(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? formatHttpError(response);
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

async function withDirectFetchFallback<T>(
  backgroundRequest: () => Promise<T>,
  directRequest: () => Promise<T>,
): Promise<T> {
  try {
    return await backgroundRequest();
  } catch (error) {
    const message = formatErrorMessage(error);
    if (message.includes("Receiving end does not exist") || message.includes("Could not establish connection")) {
      return directRequest();
    }
    throw error;
  }
}

export async function checkHealth(fetchImpl?: FetchLike): Promise<HealthResponse> {
  return withDirectFetchFallback(
    () => sendToBackground({ type: "HEALTH" }),
    () => fetchJson<HealthResponse>(`${BASE_URL}/health`, undefined, fetchImpl),
  );
}

export async function matchJob(payload: MatchPayload, fetchImpl?: FetchLike): Promise<MatchResult> {
  return withDirectFetchFallback(
    () => sendToBackground({ type: "MATCH", payload }),
    () =>
      fetchJson<MatchResult>(
        `${BASE_URL}/match`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        fetchImpl,
      ),
  );
}

export const BASE_URL = "http://127.0.0.1:8765";

function formatHttpError(response: Response) {
  const statusText = response.statusText.trim();
  return `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/* ---------- compatibility client used by UI and unit tests ---------- */

export class LocalApiClient {
  private readonly baseUrl: string;

  private readonly fetchImpl?: FetchLike;

  constructor(baseUrl = BASE_URL, fetchImpl?: FetchLike) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async health(): Promise<HealthResponse> {
    if (!this.fetchImpl) return checkHealth();

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`);
      if (!response.ok) throw new Error(formatHttpError(response));
      return (await response.json()) as HealthResponse;
    } catch (error) {
      throw new Error(`Local service unavailable: ${formatErrorMessage(error)}`);
    }
  }

  async uploadResume(file: File): Promise<ResumeProfile> {
    return uploadResume(file) as Promise<ResumeProfile>;
  }

  async match(payload: MatchPayload): Promise<MatchResult> {
    return matchJob(payload);
  }
}

/* ---------- Direct upload (uses FormData — must go through direct fetch) ---------- */

export async function uploadResume(
  file: File,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchImpl(`${BASE_URL}/resume/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}
