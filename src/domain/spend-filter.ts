/** Which expenses the calendar counts: all of ours, only those just ours, or only those we fronted for others. */
export const SPEND_FILTERS = ["all", "mine", "fronted"] as const;
export type SpendFilter = (typeof SPEND_FILTERS)[number];
