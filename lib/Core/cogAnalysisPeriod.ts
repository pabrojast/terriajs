/** Calendar periods supported by the existing COG resolution IDs. */
export type CogAnalysisPeriod = "daily" | "monthly" | "annual";
export function calendarPeriod(id?: string): CogAnalysisPeriod | undefined {
  return id === "daily" || id === "monthly" || id === "annual" ? id : undefined;
}

/** Store complete UTC periods as inclusive dates; unknown resolutions use exact dates. */
export function periodBoundary(
  value: string | undefined,
  id?: string,
  end = false
): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]),
    month = Number(match[2] ?? 1),
    day = Number(match[3] ?? 1);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return undefined;
  if (id === "annual")
    return new Date(Date.UTC(year, end ? 12 : 0, end ? 0 : 1))
      .toISOString()
      .slice(0, 10);
  if (id === "monthly")
    return new Date(Date.UTC(year, end ? month : month - 1, end ? 0 : 1))
      .toISOString()
      .slice(0, 10);
  return date.toISOString().slice(0, 10);
}
export function periodInput(value: string | undefined, id?: string): string {
  return value?.slice(0, id === "annual" ? 4 : id === "monthly" ? 7 : 10) ?? "";
}
export function inclusiveDateEnd(value?: string): string | undefined {
  return value ? `${value}T23:59:59.999Z` : undefined;
}
