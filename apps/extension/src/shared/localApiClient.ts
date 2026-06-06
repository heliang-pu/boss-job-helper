const DEFAULT_LOCAL_SERVICE_BASE_URL = "http://127.0.0.1:8765";

export type FetchLike = typeof fetch;

export interface HealthResponse {
  status: "ok";
  service: "job-apply-assistant-local-service";
}

export class LocalApiClient {
  private readonly baseUrl: string;

  private readonly fetchImpl: FetchLike;

  constructor(baseUrl = DEFAULT_LOCAL_SERVICE_BASE_URL, fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async health(): Promise<HealthResponse> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`);

      if (!response.ok) {
        throw new Error(formatHttpError(response));
      }

      return (await response.json()) as HealthResponse;
    } catch (error) {
      throw new Error(`Local service unavailable: ${formatErrorMessage(error)}`);
    }
  }
}

const formatHttpError = (response: Response) => {
  const statusText = response.statusText.trim();
  return `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`;
};

const formatErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
};
