import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Le Chromium de la relecture visuelle est livré avec un dossier `bin`
   * contenant son binaire. Empaqueté par Turbopack, ce dossier n'est pas
   * recopié et le lancement échoue en production avec :
   * `The input directory "/var/task/node_modules/@sparticuz/chromium/bin"
   * does not exist`. Le sortir du bundle le laisse résolu par require() à
   * l'exécution, avec ses fichiers.
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
