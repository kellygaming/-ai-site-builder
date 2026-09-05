import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Le Chromium de la relecture visuelle est livré sous forme d'archives
   * brotli dans son dossier `bin` (65 Mo), jamais importées par du code.
   *
   * Deux réglages sont nécessaires, et le premier seul ne suffit pas :
   *
   * - serverExternalPackages empêche Turbopack d'empaqueter la bibliothèque,
   *   sinon elle est déplacée et ne retrouve plus son dossier.
   * - outputFileTracingIncludes force la copie des archives dans la fonction.
   *   Le traceur de Next suit les imports ; ces fichiers n'en sont pas, il les
   *   ignorait donc silencieusement et le navigateur ne démarrait jamais.
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
