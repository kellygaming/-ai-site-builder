import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { auditInPage, type AuditFinding } from "./audit-script";

/**
 * Relecture visuelle de l'agent — l'idée du skill Claude Code "webapp-testing"
 * (regarder le rendu réel avant de conclure), portée dans une fonction
 * serverless : ni Bash, ni serveur local, ni Playwright.
 *
 * La version précédente capturait une URL déjà déployée. Depuis que l'aperçu
 * n'est plus publié, il n'y a plus d'URL : on injecte donc le HTML directement
 * dans la page avec setContent, ce qui est aussi bien plus rapide.
 */

export interface Screenshots {
  desktop: string;
  mobile: string;
  /** Constats du contrôle automatique, les plus graves d'abord. */
  findings: AuditFinding[];
}

/** Sans binaire Chromium disponible, la relecture est simplement sautée. */
export function canRender(): boolean {
  return process.env.DISABLE_VISUAL_REVIEW !== "1";
}

const DESKTOP = { width: 1440, height: 900 };
/** Format iPhone : c'est là que les sites générés cassent le plus souvent. */
const MOBILE = { width: 390, height: 844 };

export async function captureHtml(html: string): Promise<Screenshots | null> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: DESKTOP,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    // networkidle0 attendrait chaque photo distante ; on borne plutôt le temps
    // de chargement, quitte à capturer une image encore en cours d'arrivée.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await new Promise((r) => setTimeout(r, 1200));

    const desktop = Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
    const deskFindings = await page.evaluate(auditInPage, false);

    await page.setViewport(MOBILE);
    await new Promise((r) => setTimeout(r, 400));
    const mobile = Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
    const mobileFindings = await page.evaluate(auditInPage, true);

    // Les constats de gravité haute passent devant : si l'agent ne corrige
    // qu'une chose, autant que ce soit la plus coûteuse pour le visiteur.
    const findings = [...deskFindings, ...mobileFindings].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "haute" ? -1 : 1,
    );

    return { desktop, mobile, findings };
  } catch (error) {
    // Une capture ratée ne doit jamais empêcher la livraison du site.
    console.error("[screenshot] capture échouée", error);
    return null;
  } finally {
    await browser?.close();
  }
}
