import { z } from "zod";
export const widgetKinds = ["summary", "pipeline", "projects", "review", "activity", "deadlines", "notes", "links"] as const;
export const widgetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(widgetKinds),
  title: z.string().trim().min(1).max(80),
  width: z.enum(["small", "medium", "wide"]),
  content: z.string().max(3000).default(""),
  links: z.array(z.object({ label: z.string().trim().min(1).max(100), url: z.string().url().max(1000).refine(v => /^https?:\/\//i.test(v)) })).max(12).default([]),
});
export const dashboardSchema = z.array(widgetSchema).max(24).refine(v => new Set(v.map(w => w.id)).size === v.length);
export type DashboardWidget = z.infer<typeof widgetSchema>;
export const widgetLabels: Record<DashboardWidget["kind"], string> = {
  summary: "Projectcijfers", pipeline: "Projectpipeline", projects: "Lopende projecten", review: "Klaar voor review",
  activity: "Laatste activiteit", deadlines: "Komende deadlines", notes: "Mijn notities", links: "Snelle links",
};
export function defaultWidgets(): DashboardWidget[] {
  return (["summary", "pipeline", "projects", "review", "activity", "deadlines"] as const).map((kind, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    kind, title: widgetLabels[kind], width: kind === "summary" ? "wide" : ["projects", "pipeline"].includes(kind) ? "medium" : "small", content: "", links: [],
  }));
}
