import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { db, config } from "@/lib/server";
import PortalEntry from "../../portal-entry";
import LogoutButton from "../../logout-button";
export const dynamic = "force-dynamic";
export default async function Portal({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  if (!z.string().uuid().safeParse(project).success) notFound();
  const identity = await requireUser(`/portaal/${project}`);
  const profile = await db().prepare("SELECT id,name,email,role FROM users WHERE id=?").bind(identity.userId).first<Record<string, any>>();
  const allowed = await db().prepare("SELECT p.id,p.title,p.client,p.deadline,p.status,p.progress FROM projects p WHERE p.id=? AND (p.owner=? OR EXISTS (SELECT 1 FROM memberships m WHERE m.project=p.id AND m.email=? AND m.revoked=0) OR ?=1)").bind(project, identity.userId, identity.email, !!config().ADMIN_EMAIL && identity.email === config().ADMIN_EMAIL.toLowerCase() ? 1 : 0).first<Record<string, any>>();
  if (!allowed) return <div className="portal-access-message"><h1>Geen toegang tot dit klantportaal</h1><p>Je bent ingelogd als {identity.email}. Gebruik het adres waarop je bent uitgenodigd, of vraag de developer om toegang.</p><LogoutButton /><a href="/">Naar je werkplek</a></div>;
  return <PortalEntry project={allowed} user={profile || { id: identity.userId, name: identity.fullName, email: identity.email, role: "client" }} needsProfile={!profile} />;
}
