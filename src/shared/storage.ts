import { AppState, AuthState, GhostState, SettingsState } from './types';

const defaultAuthState: AuthState = {
  isLoggedIn: false,
  userId: null,
  username: null,
  avatarUrl: null,
  csrfToken: null,
  appId: null,
  dtsgToken: null,
};

const defaultGhostState: GhostState = {
  enabled: false,
  dmBlocked: 0,
  storyBlocked: 0,
};

const defaultSettingsState: SettingsState = {
  adBlockEnabled: true,
  ghostModeEnabled: false,
  ghostModeAuto: false,
  theme: 'light',
};

export class AppStorage {
  static async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] !== undefined ? result[key] : null);
      });
    });
  }

  static async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  static async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  }

  static async getState(): Promise<AppState> {
    const auth = (await this.get<AuthState>('auth')) || defaultAuthState;
    const ghost = (await this.get<GhostState>('ghost')) || defaultGhostState;
    const settings = (await this.get<SettingsState>('settings')) || defaultSettingsState;

    return { auth, ghost, settings };
  }

  static async updateState(partial: Partial<AppState>): Promise<void> {
    const promises: Promise<void>[] = [];
    if (partial.auth) promises.push(this.set('auth', partial.auth));
    if (partial.ghost) promises.push(this.set('ghost', partial.ghost));
    if (partial.settings) promises.push(this.set('settings', partial.settings));

    await Promise.all(promises);
  }

  static onChanged(callback: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void): void {
    chrome.storage.onChanged.addListener(callback);
  }
}
