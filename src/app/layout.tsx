import type { Metadata, Viewport } from "next";
// Fonts bundled with the app (work offline in the APK, no Google request).
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weekend in Famiglia",
  description: "Concierge tool: 3 idee per il weekend in famiglia e bozza della mail del venerdì.",
};

export const viewport: Viewport = {
  themeColor: "#1d5fd1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
