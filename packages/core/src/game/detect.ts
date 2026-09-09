import type { FileSystemPort } from "../ports/filesystem.js";
import type { TargetGame } from "../model/types.js";

export interface GameDetection {
  game: TargetGame;
  /** Aspyr (Steam/GOG 2015+, macOS, mobile) layout detected. */
  isAspyr: boolean;
  /** Absolute path to the game executable when found. */
  executable?: string;
  /** Whether the directory looks like a KOTOR install at all. */
  looksLikeKotor: boolean;
  /** Markers that led to the decision, for diagnostics. */
  markers: string[];
}

const K1_MARKERS = ["swkotor.exe", "chitin.key", "dialog.tlk", "swkotor.ini"];
const K2_MARKERS = ["swkotor2.exe", "swkotor2.ini", "dialog.tlk", "chitin.key"];
const ASPYR_MARKERS = ["steam_api.dll", "kotor2", "swkotor2 (aspyr).exe", "steamassets", "contents/macos"];

async function listLower(fs: FileSystemPort, dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    for (const e of await fs.readDir(dir)) out.set(e.name.toLowerCase(), e.path);
  } catch {
    /* not a directory */
  }
  return out;
}

/**
 * Detect which game lives in `kotorDirectory` by looking at well-known files.
 * Never throws; an empty or unreadable directory yields `game: "Unknown"`.
 */
export async function detectGame(kotorDirectory: string, fs: FileSystemPort): Promise<GameDetection> {
  const entries = await listLower(fs, kotorDirectory);
  const markers: string[] = [];
  let game: TargetGame = "Unknown";
  let executable: string | undefined;

  if (entries.has("swkotor2.exe")) {
    game = "KOTOR2";
    executable = entries.get("swkotor2.exe");
    markers.push("swkotor2.exe");
  } else if (entries.has("swkotor.exe")) {
    game = "KOTOR1";
    executable = entries.get("swkotor.exe");
    markers.push("swkotor.exe");
  } else if (entries.has("swkotor2.ini") || entries.has("streamvoice")) {
    game = "KOTOR2";
    markers.push(entries.has("swkotor2.ini") ? "swkotor2.ini" : "streamvoice/");
  } else if (entries.has("swkotor.ini") || entries.has("streamwaves")) {
    game = "KOTOR1";
    markers.push(entries.has("swkotor.ini") ? "swkotor.ini" : "streamwaves/");
  }

  // Aspyr macOS bundle: KOTOR2.app/Contents/...
  if (game === "Unknown" && entries.has("contents")) {
    const contents = await listLower(fs, entries.get("contents")!);
    if (contents.has("macos") || contents.has("resources")) {
      game = "KOTOR2";
      markers.push("Contents/ (macOS bundle)");
    }
  }

  const isAspyr = ASPYR_MARKERS.some((m) => entries.has(m)) || (game === "KOTOR2" && !entries.has("swkotor2.exe") && entries.has("steam_api.dll"));
  if (isAspyr) markers.push("aspyr layout");

  const looksLikeKotor =
    game !== "Unknown" ||
    K1_MARKERS.some((m) => entries.has(m)) ||
    K2_MARKERS.some((m) => entries.has(m));

  return { game, isAspyr, executable, looksLikeKotor, markers };
}

/**
 * List files currently present in the Override folder, lowercase names, for
 * conflict reporting. Missing folder yields an empty list.
 */
export async function listOverride(kotorDirectory: string, fs: FileSystemPort): Promise<string[]> {
  const entries = await listLower(fs, kotorDirectory);
  const override = entries.get("override");
  if (!override) return [];
  const files = await fs.walk(override);
  return files.map((f) => f.slice(override.length + 1).toLowerCase()).sort();
}
