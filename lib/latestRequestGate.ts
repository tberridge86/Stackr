export function createLatestRequestGate() {
  let latest = 0;
  return { start: () => ++latest, isCurrent: (token: number) => token === latest };
}
