import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { LogoMark } from "@/components/ui/logo-mark";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Créez votre site avec l'IA — sans coder",
  description:
    "Décrivez votre site, l'agent le construit, le pousse sur GitHub et le déploie sur Vercel pour vous.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <header className="flex items-center px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-sm font-bold text-text">AI Site Builder</span>
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
