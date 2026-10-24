/**
 * Makes a test see a phone whose clock is `offsetHours` ahead of UTC, whatever the machine's own
 * zone is. A Jest test cannot change the process time zone, so the local date and time getters read
 * from the shifted moment instead. Call jest.restoreAllMocks() afterwards.
 */
export function simulateZone(offsetHours: number) {
  const shifted = (d: Date) => new Date(d.getTime() + offsetHours * 3_600_000);
  jest.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (this: Date) { return shifted(this).getUTCFullYear(); });
  jest.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) { return shifted(this).getUTCMonth(); });
  jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) { return shifted(this).getUTCDate(); });
  jest.spyOn(Date.prototype, 'getHours').mockImplementation(function (this: Date) { return shifted(this).getUTCHours(); });
}
