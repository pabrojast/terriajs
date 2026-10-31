import type { DashboardResult } from "./Types";

/** One server calculation at a time. Camera changes replace only the waiting request. */
export default class QueryRunner {
  private desired?: string;
  private active?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private controller = new AbortController();
  constructor(
    private request: (
      key: string,
      signal: AbortSignal
    ) => Promise<DashboardResult>,
    private result: (key: string, result: DashboardResult) => void,
    private error: (key: string, error: unknown) => void
  ) {}
  update(key?: string) {
    this.desired = key;
    if (!this.active && !this.running) this.schedule(750);
  }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delay);
  }
  private async tick() {
    const key = this.active ?? this.desired;
    if (!key || this.controller.signal.aborted || this.running) return;
    this.running = true;
    this.active = key;
    try {
      const value = await this.request(key, this.controller.signal);
      if (this.controller.signal.aborted) return;
      if (key === this.desired) this.result(key, value);
      const pending = value.status === "pending" || value.refreshing;
      if (!pending) this.active = undefined;
      this.schedule(pending ? 2000 : key !== this.desired ? 750 : 300000);
    } catch (error) {
      if (!this.controller.signal.aborted && key === this.desired)
        this.error(key, error);
      this.active = undefined;
      if (!this.controller.signal.aborted) this.schedule(3000);
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.controller.abort();
    clearTimeout(this.timer);
  }
}
