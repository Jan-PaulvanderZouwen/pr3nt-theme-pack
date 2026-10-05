import type { Metadata } from "next";
import "./globals.css";
import "./phase-two.css";

export const metadata: Metadata = {
  title: "Bouwr — jouw developmentwerkplek",
  description: "Projecten, biedingen en jouw klanten. Alles in één werkplek.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
