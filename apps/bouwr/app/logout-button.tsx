"use client";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
export default function LogoutButton() {
  return (
    <button
      className="icon-button"
      aria-label="Uitloggen"
      onClick={async () => {
        const result = await authClient.signOut();
        if (result.error) {
          toast.error("Uitloggen is niet gelukt. Probeer opnieuw.");
          return;
        }
        window.location.assign("/inloggen");
      }}
    >
      <LogOut size={17} />
    </button>
  );
}
