import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/**
 * Adapté du skill Claude Code "webapp-testing" (Playwright + serveur local) —
 * inutilisable tel quel dans une fonction serverless : pas de Bash, pas de
 * serveur local à gérer puisqu'on capture directement l'URL Vercel déjà en
 * ligne. Même idée de "reconnaissance avant action" (regarder le rendu
 * réel avant de conclure), avec Puppeteer headless au lieu de Playwright.
 */

/** Attend que l'URL réponde 200 (une déploiement fraîche peut mettre 1-2s à se propager). */
async function waitUntilLive(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (res.ok) return true;
    } catch {
      // pas encore prêt, on retente
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Retourne un PNG en base64 du site déployé, ou null si la capture échoue (non bloquant). */
export async function captureScreenshot(url: string): Promise<string | null> {
  const live = await waitUntilLive(url);
  if (!live) return null;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 20000 });
    const buffer = await page.screenshot({ type: "png" });
    return Buffer.from(buffer).toString("base64");
  } catch {
    return null;
  } finally {
    await browser?.close();
  }
}
