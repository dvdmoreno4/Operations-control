// Goals of the individual KPIs. Shared by API routes and the UI.

/** Screen time: productive hours a month for a score of 100. */
export const SCREEN_HOURS_GOAL = 140;

/** Interactive Brokers: minimum return a year, in %. */
export const ANNUAL_RETURN_GOAL_PCT = 25;

/** Projects: completed projects a semester and a year. */
export const PROJECTS_PER_SEMESTER_GOAL = 1;
export const PROJECTS_PER_YEAR_GOAL = 2;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Screen time score (0-100): hours of the month over the monthly goal. */
export const screenScore = (hours: number, goal = SCREEN_HOURS_GOAL) => Math.max(0, Math.min(100, round1((hours / goal) * 100)));

/** Share of the annual return goal due by the end of a month (1-12), in %: 25% x 5/12 by May. */
export const proRataReturnGoal = (month: number, annualGoal = ANNUAL_RETURN_GOAL_PCT) => round1((annualGoal * month) / 12);
