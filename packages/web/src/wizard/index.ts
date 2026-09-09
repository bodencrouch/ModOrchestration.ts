import type { ComponentType } from "react";
import type { PageId } from "./navigation";
import { Welcome } from "./Welcome";
import { BeforeContent } from "./BeforeContent";
import { Setup } from "./Setup";
import { AspyrNotice } from "./AspyrNotice";
import { BaseModSelection } from "./ModSelection";
import { DownloadsExplain } from "./DownloadsExplain";
import { Validate } from "./Validate";
import { InstallStart } from "./InstallStart";
import { Installing } from "./Installing";
import { BaseInstallComplete } from "./InstallComplete";
import { WidescreenNotice } from "./WidescreenNotice";
import { WidescreenModSelection } from "./WidescreenModSelection";
import { WidescreenInstalling } from "./WidescreenInstalling";
import { WidescreenComplete } from "./WidescreenComplete";
import { Finished } from "./Finished";

export const PAGE_COMPONENTS: Record<PageId, ComponentType> = {
  Welcome,
  BeforeContent,
  Setup,
  AspyrNotice,
  ModSelection: BaseModSelection,
  DownloadsExplain,
  Validate,
  InstallStart,
  Installing,
  BaseInstallComplete,
  WidescreenNotice,
  WidescreenModSelection,
  WidescreenInstalling,
  WidescreenComplete,
  Finished,
};

export * from "./navigation";
