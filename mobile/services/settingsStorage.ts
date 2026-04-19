import AsyncStorage from "@react-native-async-storage/async-storage";

const MUTE_KEY = "whos_that_animal_sound_muted_v1";
const EMBED_KEY = "whos_that_animal_embed_mode_v1";

export async function getSoundMuted(): Promise<boolean> {
  const v = await AsyncStorage.getItem(MUTE_KEY);
  return v === "1";
}

export async function setSoundMuted(muted: boolean): Promise<void> {
  await AsyncStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Wikimedia-only images + optional HTML embed (no local `images/` folder). */
export async function getEmbedMode(): Promise<boolean> {
  const v = await AsyncStorage.getItem(EMBED_KEY);
  return v === "1";
}

export async function setEmbedMode(on: boolean): Promise<void> {
  await AsyncStorage.setItem(EMBED_KEY, on ? "1" : "0");
}
