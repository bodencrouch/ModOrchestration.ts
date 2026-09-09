/* Shared markdown fixtures for the serialization tests (plus a sanity test). */
import { describe, expect, it } from "vitest";

/** A realistic r/kotor style `full.md` with three mods. */
export const K1_FULL_MD = String.raw`# KOTOR 1 Full Build

## Introduction

This is the r/kotor mod build for **KOTOR 1**. Read everything before you begin.

### Table of Contents

1. Mod List
2. Closing

## Mod List

Mods are listed in install order.

### KOTOR 1 Community Patch
<!--
[HIDDEN:MOD]
Guid = {C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}
[[Instruction]]
Action = Extract
Overwrite = true
Source = <<modDirectory>>\KOTOR 1 Community Patch*.zip
[[Instruction]]
Action = Patcher
Destination = <<kotorDirectory>>
Source = <<modDirectory>>\KOTOR 1 Community Patch*\TSLPatcher.exe
[ENDHIDDEN]
-->
**Name:** [KOTOR 1 Community Patch](https://deadlystream.com/files/file/1258-kotor-1-community-patch/)

**Author:** A Future Pilot, et al

**Description:** A compilation of bugfixes and improvements.

**Category & Tier:** Bugfix / 1 - Essential

**Non-English Functionality:** YES

**Installation Method:** TSLPatcher

**Installation Instructions:** Run the installer and select your game directory.

**Usage Warnings:** Install this first.

### JC's Minor Fixes for K1
**Name:** [JC's Minor Fixes for K1](https://deadlystream.com/files/file/1474-jcs-minor-fixes-for-k1/) (also: [mirror](https://example.com/mirror.zip))
**Author:** JCarter426
**Description:** Fixes a handful of minor issues.
**Category & Tier:** Bugfix & Immersion / 2 - Recommended
**Non-English Functionality:** YES
**Installation Method:** Loose-File
**Masters:** KOTOR 1 Community Patch, Some Mod That Does Not Exist
**Installation Instructions:**
1. **EXTRACT** ` + "`<<modDirectory>>/JC's Minor Fixes for K1*.zip`" + String.raw`
2. **MOVE ALL** from ` + "`<<modDirectory>>/JC's Minor Fixes for K1*/Straight Fixes/*`" + " to `<<kotorDirectory>>/Override`" + String.raw`
3. **MOVE SPECIFIC** from ` + "`<<modDirectory>>/JC's Minor Fixes for K1*/Things What Bother Me Fixes/`" + " to `<<kotorDirectory>>/Override`:" + String.raw`
   - man26_enter4.dlg
   - k_pdan_zhar10.dlg
4. **DELETE** ` + "`<<kotorDirectory>>/Override/foo.tga`" + String.raw`
5. **RENAME** ` + "`<<modDirectory>>/JC's Minor Fixes for K1*/w_ionrfl_04.mdl` to `w_ionrfl_004.mdl`" + String.raw`
6. **SKIP** the Bugfix folder (applied later)

**Usage Warnings:** Skip the "Things What Bother Me" fixes if you dislike them.

## Widescreen Mods

Only install these after the base build.

### KOTOR High Resolution Menus
**Name:** [KOTOR High Resolution Menus](https://deadlystream.com/files/file/1264-kotor-high-resolution-menus/)
**Author:** ndix UR
**Description:** (spoiler-free)
**Category & Tier:** UI / 2 - Recommended
**Non-English Functionality:** YES
**Installation Method:** Loose-File
**Installation Instructions:** Extract the archive and move the contents of the folder matching your resolution to the Override folder.

## Closing

That's it, enjoy the game!
`;

/** A DeadlyStream style KOTOR 2 guide with a YAML hidden block and an Aspyr section. */
export const K2_DS_MD = String.raw`# KOTOR 2 (The Sith Lords) Mod Build

<!--<<ModSync:Config>>
TargetGame: KOTOR2
Version: rev 3
-->

Intro paragraph.

## Mod List

## Aspyr Patch Notes

If you use the Aspyr patch, read this.

## The Sith Lords Restored Content Mod (TSLRCM)
<!--<<ModSync>>
Guid: 751edb92-05e8-4b5f-a98c-1bf9921ac05b
Instructions:
  - Guid: 851edb92-05e8-4b5f-a98c-1bf9921ac05b
    Action: Extract
    Source:
      - <<modDirectory>>\TSLRCM*.zip
  - Action: Move
    Overwrite: true
    Source: [feat.2da, featgain.2da]
    Destination: <<kotorDirectory>>\Override
Options:
  - Name: Skip intro
    IsSelected: true
    Instructions:
      - Action: Delete
        Source: <<kotorDirectory>>\Override\intro.bik
-->
**Name:** [TSLRCM](https://deadlystream.com/files/file/578-tsl-restored-content-mod/)
**Author:** Zbyl2, DarthStoney, Hassat Hunter, VarsityPuppet
**Description:** Restores cut content.
**Category & Tier:** Restored Content / 1 - Essential
**Installation Method:** Installer

## Character Start Up Changes
**Name:** [Character Start Up Changes](https://deadlystream.com/files/file/1-csuc/)
**Author:** Shem
**Description:** Changes feats.
**Category & Tier:** Mechanics Change / 3 - Suggested
**Installation Method:** Loose-File
**Masters:** TSLRCM
**Installation Instructions:** Drop the files into Override.
`;

describe("fixtures", () => {
  it("contain the expected mod headings", () => {
    expect(K1_FULL_MD.match(/^### /gm)).toHaveLength(4);
    expect(K2_DS_MD.match(/^## /gm)).toHaveLength(4);
  });
});
