"use client";
import { useEffect, useState } from "react";
import ClientPortal from "./client-portal";
import LogoutButton from "./logout-button";
type Row = Record<string, any>;
export default function PortalEntry({ project, user, needsProfile }: { project: Row; user: Row; needsProfile: boolean }) {
  const [ready, setReady] = useState(!needsProfile), [error, setError] = useState("");
  useEffect(() => {
    if (!needsProfile) return;
    let active = true;
    void fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "preparePortal", project: project.id }) }).then(async response => {
      const value = await response.json(); if (!response.ok) throw Error(value.error);
      if (active) setReady(true);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [needsProfile, project.id]);
  if (!ready) return <div className="portal-access-message"><h1>{error ? "Het portaal kon niet worden geopend" : "Je klantportaal wordt geopend…"}</h1>{error && <><p role="alert">{error}</p><button className="outline" onClick={() => window.location.reload()}>Opnieuw proberen</button><LogoutButton /></>}</div>;
  return <ClientPortal projects={[project]} user={user} initialProject={project.id} onBack={() => window.location.assign("/")} />;
}
