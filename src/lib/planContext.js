import { createContext, useContext } from 'react';
import { getPlanState } from './planState';

export const PlanContext = createContext(null);
/** { plan, sub, usage, openUpgrade(reason?), refresh() } — demo/outside guard gets a no-op default. */
export function usePlan() {
  return useContext(PlanContext) || { plan: getPlanState(), sub: null, usage: null, openUpgrade: () => {}, refresh: async () => {} };
}
