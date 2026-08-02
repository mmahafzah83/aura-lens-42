/**
 * Gate for the fit ladder: the bundled faces must be rasterised before any
 * measurement, otherwise fallback metrics (much wider than Anton) report a
 * wrap that does not exist. `document.fonts.ready` can settle before these
 * faces are even requested, so each family is loaded explicitly.
 */
const SPECS: Array<[string, string]> = [
  ['400 150px "AuraAnton"', "AGMTW"],
  ['400 38px "AuraInter"', "AGMTW"],
  ['500 38px "AuraInter"', "AGMTW"],
  ['700 31px "AuraInter"', "AGMTW"],
  ['800 54px "AuraInter"', "AGMTW"],
  ['400 26px "AuraMono"', "0123"],
  ['600 26px "AuraMono"', "0123"],
  ['400 38px "AuraCairo"', "غثقف"],
  ['700 38px "AuraCairo"', "غثقف"],
  ['900 92px "AuraCairo"', "غثقف"],
];

let loaded = false;
let pending: Promise<void> | null = null;

export function carouselFontsLoaded(): boolean {
  return loaded;
}

export function ensureCarouselFonts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (pending) return pending;
  if (typeof document === "undefined" || !document.fonts) {
    loaded = true;
    return Promise.resolve();
  }
  pending = Promise.all(
    SPECS.map(([spec, sample]) => document.fonts.load(spec, sample).catch(() => undefined)),
  )
    .then(() => document.fonts.ready)
    .then(() => {
      loaded = true;
    });
  return pending;
}
