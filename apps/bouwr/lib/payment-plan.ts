import { z } from "zod";

export const PLATFORM_FEE_PERCENT = 5;
export const phasePlanSchema = z.array(z.object({
  name: z.string().trim().min(1).max(100),
  percentage: z.number().int().min(1).max(100),
})).min(2).max(8).refine(phases => phases.reduce((sum, p) => sum + p.percentage, 0) === 100, "De fases moeten samen 100% zijn.");
export const defaultPhases = [
  { name: "Ontwerp & akkoord", percentage: 30 },
  { name: "Development & test", percentage: 40 },
  { name: "Oplevering & overdracht", percentage: 30 },
];
export function phaseAmounts(budget: number, phases: { percentage: number }[]) {
  let assigned = 0;
  return phases.map((phase, index) => {
    const amount = index === phases.length - 1 ? budget - assigned : Math.round(budget * phase.percentage / 100);
    assigned += amount;
    return amount;
  });
}
