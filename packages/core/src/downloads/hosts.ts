/**
 * URL classification for the download manager. Pure string logic, no I/O.
 */

export type DownloadHost = "nexus" | "deadlystream" | "github" | "mega" | "direct" | "other";

export interface UrlClassification {
  host: DownloadHost;
  /** Nexus game domain, e.g. "kotor" or "kotor2". */
  game?: string;
  modId?: number;
  fileId?: number;
  /** True for `nxm://` links (handled by Vortex/an external handler). */
  nxm?: boolean;
  /**
   * True when the URL is known to require a browser session: DeadlyStream
   * file pages (login), mega.nz (JS client), Nexus without an API key path.
   * The manager makes the final call after looking at the response.
   */
  needsBrowser: boolean;
  reason?: string;
}

const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|exe|tar|gz|tgz|bz2|xz|mod|erf|tpc|tga|mdl|mdx|2da|wav|mp3)$/i;

function num(v: string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Filename of the last URL path segment (decoded), or undefined. */
export function fileNameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    if (!seg) return undefined;
    const name = decodeURIComponent(seg);
    return name || undefined;
  } catch {
    return undefined;
  }
}

/** Parse `nxm://kotor/mods/1234/files/5678?key=...&expires=...`. */
export function parseNxmUrl(url: string): { game: string; modId?: number; fileId?: number } | undefined {
  const m = /^nxm:\/\/([^/?#]+)\/mods\/(\d+)(?:\/files\/(\d+))?/i.exec(url);
  if (!m) return undefined;
  return { game: m[1].toLowerCase(), modId: num(m[2]), fileId: num(m[3]) };
}

export function classifyUrl(url: string): UrlClassification {
  const nxm = parseNxmUrl(url);
  if (nxm) return { host: "nexus", nxm: true, needsBrowser: false, ...nxm };

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { host: "other", needsBrowser: false, reason: "not a valid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { host: "other", needsBrowser: false, reason: `unsupported scheme ${u.protocol}` };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname;

  if (host === "nexusmods.com" || host.endsWith(".nexusmods.com")) {
    const m = /^\/([^/]+)\/mods\/(\d+)/i.exec(path);
    const fileId = num(u.searchParams.get("file_id"));
    if (m) {
      return { host: "nexus", game: m[1].toLowerCase(), modId: num(m[2]), fileId, needsBrowser: false };
    }
    return { host: "nexus", needsBrowser: true, reason: "unrecognised Nexus URL" };
  }
  if (host === "deadlystream.com" || host.endsWith(".deadlystream.com")) {
    const isFilePage = /^\/files\/file\//i.test(path);
    return {
      host: "deadlystream",
      needsBrowser: isFilePage || !ARCHIVE_EXTENSIONS.test(path),
      reason: isFilePage ? "DeadlyStream downloads require a logged-in browser session" : undefined,
    };
  }
  if (host === "github.com" || host.endsWith(".github.com") || host === "githubusercontent.com" || host.endsWith(".githubusercontent.com")) {
    return { host: "github", needsBrowser: false };
  }
  if (host === "mega.nz" || host === "mega.co.nz" || host.endsWith(".mega.nz") || host.endsWith(".mega.co.nz")) {
    return { host: "mega", needsBrowser: true, reason: "mega.nz downloads need the browser client" };
  }
  if (ARCHIVE_EXTENSIONS.test(path)) return { host: "direct", needsBrowser: false };
  return { host: "other", needsBrowser: false };
}

/** Nexus API endpoint for a file's download links. */
export function nexusDownloadLinkUrl(game: string, modId: number, fileId: number): string {
  return `https://api.nexusmods.com/v1/games/${encodeURIComponent(game)}/mods/${modId}/files/${fileId}/download_link.json`;
}
