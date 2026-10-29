/** Only identifiers and declarative layouts cross the share boundary. */
export class SimpleDashboardApi {
  private csrf = "";
  async initialize(signal?: AbortSignal) {
    const config = await this.request<{
      csrf_token: string;
      authenticated: boolean;
    }>("/config", undefined, signal);
    this.csrf = config.csrf_token;
    return config;
  }
  async request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    method?: string
  ): Promise<T> {
    const response = await fetch("/api/simple-dashboards" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(body !== undefined ? { "X-CSRFToken": this.csrf } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const value = await response
      .json()
      .catch(() => ({ error: "Dashboard unavailable" }));
    if (!response.ok) throw new Error(value.error || "Dashboard unavailable");
    return value as T;
  }
  async export(id: string, body: unknown) {
    const response = await fetch(`/api/simple-dashboards/${id}/export`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": this.csrf },
      body: JSON.stringify(body)
    });
    if (!response.ok || response.status === 202)
      throw new Error("Wait for the calculation before exporting.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "dashboard.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
