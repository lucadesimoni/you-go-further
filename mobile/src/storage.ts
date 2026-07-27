import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small persistence helper. Uses AsyncStorage on device and degrades to an
 * in-memory map anywhere it isn't available (e.g. when the screens are rendered
 * for tests), so callers never have to care.
 */
const memory = new Map<string, string>();

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return (await AsyncStorage.getItem(key)) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    memory.set(key, value);
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      /* memory copy already holds it */
    }
  },
  async remove(key: string): Promise<void> {
    memory.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
