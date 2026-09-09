/** Resource type ids (docs/KOTOR_FORMATS.md section 6). */

export const ResourceTypes = {
  res: 0,
  bmp: 1,
  tga: 3,
  wav: 4,
  plt: 6,
  ini: 7,
  txt: 10,
  mdl: 2002,
  nss: 2009,
  ncs: 2010,
  mod: 2011,
  are: 2012,
  set: 2013,
  ifo: 2014,
  bic: 2015,
  wok: 2016,
  "2da": 2017,
  tlk: 2018,
  txi: 2022,
  git: 2023,
  bti: 2024,
  uti: 2025,
  btc: 2026,
  utc: 2027,
  dlg: 2029,
  itp: 2030,
  btt: 2031,
  utt: 2032,
  dds: 2033,
  uts: 2035,
  ltr: 2036,
  gff: 2037,
  fac: 2038,
  bte: 2039,
  ute: 2040,
  btd: 2041,
  utd: 2042,
  btp: 2043,
  utp: 2044,
  dft: 2045,
  gic: 2046,
  gui: 2047,
  btm: 2050,
  utm: 2051,
  dwk: 2052,
  pwk: 2053,
  jrl: 2056,
  sav: 2057,
  utw: 2058,
  "4pc": 2059,
  ssf: 2060,
  hak: 2061,
  nwm: 2062,
  bik: 2063,
  ndb: 2064,
  ptm: 2065,
  ptt: 2066,
  jpg: 2076,
  png: 2110,
  lyt: 3000,
  vis: 3001,
  rim: 3002,
  pth: 3003,
  lip: 3004,
  tpc: 3007,
  mdx: 3008,
  cwa: 3027,
  bip: 3028,
  erf: 9997,
  bif: 9998,
  key: 9999,
  mp3: 25014,
} as const;

export type ResourceExtension = keyof typeof ResourceTypes;
export type ResourceType = (typeof ResourceTypes)[ResourceExtension];

const BY_ID = new Map<number, string>();
for (const [ext, id] of Object.entries(ResourceTypes)) if (!BY_ID.has(id)) BY_ID.set(id, ext);

/** Resource type id for an extension ("uti", ".UTI"), or undefined. */
export function resourceTypeFromExtension(ext: string): number | undefined {
  const key = ext.replace(/^\./, "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(ResourceTypes, key) ? ResourceTypes[key as ResourceExtension] : undefined;
}

/** Lowercase extension (without dot) for a resource type id, or undefined. */
export function extensionFromResourceType(id: number): string | undefined {
  return BY_ID.get(id);
}

/** Split "p_bastila.utc" into { resref: "p_bastila", type: 2027 }; type is undefined for unknown extensions. */
export function splitResourceName(filename: string): { resref: string; ext: string; type: number | undefined } {
  const base = filename.replace(/^.*[\\/]/, "");
  const dot = base.lastIndexOf(".");
  if (dot < 0) return { resref: base, ext: "", type: undefined };
  const ext = base.slice(dot + 1);
  return { resref: base.slice(0, dot), ext, type: resourceTypeFromExtension(ext) };
}
