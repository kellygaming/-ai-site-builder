/**
 * Contrôle automatique du site généré, exécuté DANS la page.
 *
 * Volontairement pas une analyse du texte HTML : dans le navigateur on lit les
 * styles réellement calculés et la géométrie réelle des éléments. C'est la
 * seule façon de juger un contraste ou une zone tactile — et de voir qu'une
 * page déborde sur téléphone.
 *
 * Chaque règle est déterministe et sans jugement esthétique : elle passe ou
 * elle ne passe pas. Les règles qui pourraient se tromper (contraste derrière
 * une image de fond) préfèrent se taire.
 */
export interface AuditFinding {
  severity: "haute" | "moyenne";
  message: string;
}

/** Sérialisé et injecté dans la page ; ne dépend d'aucun import. */
export function auditInPage(isMobile: boolean): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const add = (severity: "haute" | "moyenne", message: string) =>
    findings.push({ severity, message });

  const text = (el: Element) => (el as HTMLElement).innerText?.trim() ?? "";

  // ---- Document ------------------------------------------------------------
  if (!isMobile) {
    if (!document.documentElement.getAttribute("lang")) {
      add("haute", "L'attribut lang manque sur <html> : les lecteurs d'écran et Google ne savent pas dans quelle langue est la page.");
    }
    if (!document.title.trim()) {
      add("haute", "La page n'a pas de <title> : c'est ce qui s'affiche dans l'onglet et dans les résultats Google.");
    }
    if (!document.querySelector('meta[name="description"]')) {
      add("moyenne", "Pas de meta description : Google affichera un extrait au hasard sous le lien du site.");
    }
    if (!document.querySelector('meta[name="viewport"]')) {
      add("haute", "Pas de meta viewport : le site s'affichera dézoomé et illisible sur téléphone.");
    }

    const h1 = document.querySelectorAll("h1");
    if (h1.length === 0) add("haute", "Aucun <h1> : la page n'annonce pas son sujet principal.");
    else if (h1.length > 1) add("moyenne", `${h1.length} balises <h1> : il n'en faut qu'une, le titre principal.`);

    // ---- Images ------------------------------------------------------------
    const noAlt = document.querySelectorAll("img:not([alt])").length;
    if (noAlt > 0) {
      add("haute", `${noAlt} image(s) sans attribut alt : invisibles pour un lecteur d'écran et pour Google.`);
    }

    const noSize = Array.from(document.querySelectorAll("img")).filter((img) => {
      const styled = getComputedStyle(img);
      return (
        !img.getAttribute("width") &&
        !img.getAttribute("height") &&
        styled.aspectRatio === "auto" &&
        styled.height === "auto"
      );
    }).length;
    if (noSize > 0) {
      add("moyenne", `${noSize} image(s) sans dimensions fixées : la page saute pendant le chargement des photos.`);
    }

    // ---- Liens et boutons --------------------------------------------------
    const dead = document.querySelectorAll('a[href="#"], a[href=""]').length;
    if (dead > 0) {
      add("moyenne", `${dead} lien(s) qui ne mènent nulle part (href="#") : soit ils pointent vers une vraie ancre, soit ce ne sont pas des liens.`);
    }

    const unnamed = Array.from(document.querySelectorAll("a, button")).filter(
      (el) =>
        !text(el) &&
        !el.getAttribute("aria-label") &&
        !el.getAttribute("title") &&
        !el.querySelector("img[alt]:not([alt=''])"),
    ).length;
    if (unnamed > 0) {
      add("haute", `${unnamed} bouton(s) ou lien(s) sans texte ni libellé : impossible de savoir à quoi ils servent sans les voir.`);
    }

    const unlabeled = Array.from(
      document.querySelectorAll("input:not([type='hidden']):not([type='submit']), select, textarea"),
    ).filter((el) => {
      if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
      return !el.closest("label");
    }).length;
    if (unlabeled > 0) {
      add("haute", `${unlabeled} champ(s) de formulaire sans étiquette : un placeholder n'en est pas une, il disparaît dès qu'on tape.`);
    }

    // ---- Émoji en guise d'icône -------------------------------------------
    const pictogram = /\p{Extended_Pictographic}/u;
    const emojiIcons = Array.from(document.querySelectorAll('[class*="icon" i]')).filter((el) =>
      pictogram.test(el.textContent ?? ""),
    ).length;
    if (emojiIcons > 0) {
      add("moyenne", `${emojiIcons} émoji utilisé(s) comme icône : c'est la signature d'un site généré. Remplace-les par des SVG dessinés.`);
    }

    // ---- Contraste ---------------------------------------------------------
    const channels = (value: string): [number, number, number] | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((n) => parseFloat(n));
      if (parts.length > 3 && parts[3] === 0) return null;
      return [parts[0], parts[1], parts[2]];
    };
    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    /** Fond effectif : on remonte jusqu'à une couleur opaque. Une image de
     *  fond rend le calcul impossible — on se tait plutôt que d'accuser à tort. */
    const backdrop = (el: Element): [number, number, number] | null => {
      let node: Element | null = el;
      while (node) {
        const styled = getComputedStyle(node);
        if (styled.backgroundImage !== "none") return null;
        const color = channels(styled.backgroundColor);
        if (color) return color;
        node = node.parentElement;
      }
      return [255, 255, 255];
    };

    let lowContrast = 0;
    const candidates = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, a, li, span, button")).slice(0, 200);
    for (const el of candidates) {
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1,
      );
      if (!own) continue;

      const styled = getComputedStyle(el);
      const foreground = channels(styled.color);
      const background = backdrop(el);
      if (!foreground || !background) continue;

      const l1 = luminance(foreground);
      const l2 = luminance(background);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      const size = parseFloat(styled.fontSize);
      const weight = parseInt(styled.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      if (ratio < (large ? 3 : 4.5)) lowContrast++;
    }
    if (lowContrast > 0) {
      add("haute", `${lowContrast} texte(s) au contraste insuffisant sur leur fond : illisibles en plein soleil ou pour une vue fatiguée.`);
    }
  }

  // ---- Contrôles propres au mobile ----------------------------------------
  if (isMobile) {
    if (document.documentElement.scrollWidth > window.innerWidth + 2) {
      const excess = document.documentElement.scrollWidth - window.innerWidth;
      add("haute", `La page déborde de ${excess}px sur le côté en mobile : le visiteur doit faire glisser l'écran horizontalement pour tout lire.`);
    }

    const tiny = Array.from(document.querySelectorAll("a, button")).filter((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return rect.height < 40 || rect.width < 40;
    }).length;
    if (tiny > 0) {
      add("moyenne", `${tiny} bouton(s) ou lien(s) trop petits au doigt sur mobile (moins de 40px) : on tape à côté.`);
    }
  }

  return findings;
}
