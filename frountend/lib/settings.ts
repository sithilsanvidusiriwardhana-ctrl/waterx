export const DEFAULT_DISPLAY_NAME = "Student";
export const DEFAULT_THEME = "light" as const;
export const SETTINGS_STORAGE_KEY = "waterx-settings";

export type Theme = "light" | "dark";

export interface UserSettings {
  displayName: string;
  theme: Theme;
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayName: DEFAULT_DISPLAY_NAME,
  theme: DEFAULT_THEME,
};