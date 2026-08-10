/** Date locale en ISO (YYYY-MM-DD), sans conversion UTC. */
export function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aujourd'hui en ISO local. */
export function todayISO(): string {
  return localDateISO(new Date());
}
