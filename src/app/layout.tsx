import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REAL31 Intranet",
  description: "Surcouche de coordination Estale/Crypto - cabinet de syndic REAL31",
  // Application installee sur iPhone (Safari -> Partager -> Sur l'ecran d'accueil) : plein
  // ecran sans barre Safari, nom court sous l'icone. Le manifeste est src/app/manifest.ts,
  // l'icone iOS src/app/apple-icon.png (conventions Next, liens generes automatiquement).
  appleWebApp: { capable: true, title: "REAL31", statusBarStyle: "default" },
};

// Couleur de la barre d'etat / de titre de l'application installee (sapin du rail).
export const viewport: Viewport = {
  themeColor: "#152A20",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
