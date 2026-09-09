import type { AppState } from "../state/store";
import { getState, setState, hasWidescreenMods, selectedWidescreenMods, effectiveSelectedMods } from "../state/store";

export type PageId =
  | "Welcome"
  | "BeforeContent"
  | "Setup"
  | "AspyrNotice"
  | "ModSelection"
  | "DownloadsExplain"
  | "Validate"
  | "InstallStart"
  | "Installing"
  | "BaseInstallComplete"
  | "WidescreenNotice"
  | "WidescreenModSelection"
  | "WidescreenInstalling"
  | "WidescreenComplete"
  | "Finished";

export interface PageRule {
  id: PageId;
  title: string;
  /** Page is shown at all (skip logic). Default: always. */
  applies?: (s: AppState) => boolean;
  /** Next button enabled. Default: always. */
  canNext?: (s: AppState) => boolean;
  /** Back button enabled. Default: always. */
  canBack?: (s: AppState) => boolean;
  /** The page drives its own forward navigation (Next hidden). */
  hideNext?: boolean;
  nextLabel?: string;
}

const nonEmpty = (v: string | undefined) => Boolean(v && v.trim());
const dirsReady = (s: AppState) => Boolean(s.settings?.modDirectory && s.settings?.kotorDirectory);
const installIdle = (s: AppState) => !s.install.running;

export const PAGES: PageRule[] = [
  { id: "Welcome", title: "Welcome" },
  { id: "BeforeContent", title: "Before you begin", applies: (s) => nonEmpty(s.file?.config.beforeModListContent) },
  { id: "Setup", title: "Setup", canNext: (s) => Boolean(s.file) && dirsReady(s) },
  {
    id: "AspyrNotice",
    title: "Aspyr / Steam notice",
    applies: (s) => s.file?.config.targetGame === "KOTOR2" && nonEmpty(s.file?.config.aspyrSectionContent),
  },
  {
    id: "ModSelection",
    title: "Select mods",
    canNext: (s) => effectiveSelectedMods(s, "base").length > 0,
  },
  { id: "DownloadsExplain", title: "Downloads" },
  {
    id: "Validate",
    title: "Validate",
    canNext: (s) => Boolean(s.report?.ok) && !s.validating,
  },
  { id: "InstallStart", title: "Ready to install", hideNext: true },
  {
    id: "Installing",
    title: "Installing",
    canNext: (s) => installIdle(s) && Boolean(s.install.summary || s.install.cancelled || s.install.error),
    canBack: (s) => installIdle(s),
  },
  { id: "BaseInstallComplete", title: "Base install complete", canBack: () => false },
  {
    id: "WidescreenNotice",
    title: "Widescreen",
    applies: (s) => hasWidescreenMods(s) && nonEmpty(s.file?.config.widescreenSectionContent),
  },
  { id: "WidescreenModSelection", title: "Widescreen mods", applies: (s) => hasWidescreenMods(s) },
  {
    id: "WidescreenInstalling",
    title: "Installing widescreen mods",
    applies: (s) => selectedWidescreenMods(s).length > 0,
    canNext: (s) => installIdle(s) && Boolean(s.install.summary || s.install.cancelled || s.install.error),
    canBack: (s) => installIdle(s),
  },
  { id: "WidescreenComplete", title: "Widescreen complete", applies: (s) => selectedWidescreenMods(s).length > 0, canBack: () => false },
  { id: "Finished", title: "Finished", hideNext: true, canBack: () => false },
];

export function pageApplies(page: PageRule, s: AppState): boolean {
  return page.applies ? page.applies(s) : true;
}

export function currentPage(s: AppState): PageRule {
  return PAGES[Math.min(Math.max(0, s.step), PAGES.length - 1)];
}

export function nextStepIndex(s: AppState, from = s.step): number | null {
  for (let i = from + 1; i < PAGES.length; i++) if (pageApplies(PAGES[i], s)) return i;
  return null;
}

export function prevStepIndex(s: AppState, from = s.step): number | null {
  for (let i = from - 1; i >= 0; i--) if (pageApplies(PAGES[i], s)) return i;
  return null;
}

export function goNext(): void {
  const s = getState();
  const n = nextStepIndex(s);
  if (n !== null) setState({ step: n });
}

export function goBack(): void {
  const s = getState();
  const p = prevStepIndex(s);
  if (p !== null) setState({ step: p });
}

export function goTo(id: PageId): void {
  const i = PAGES.findIndex((p) => p.id === id);
  if (i >= 0) setState({ step: i });
}

/** Visible pages in order, for the progress strip. */
export function visiblePages(s: AppState): Array<{ index: number; page: PageRule }> {
  return PAGES.map((page, index) => ({ page, index })).filter(({ page }) => pageApplies(page, s));
}
