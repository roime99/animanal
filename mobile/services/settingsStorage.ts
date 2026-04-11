import AsyncStorage from "@react-native-async-storage/async-storage";

const MUTE_KEY = "animal_trivia_embed_sound_muted_v1";

export async function getSoundMuted(): Promise<boolean> {
  const v = await AsyncStorage.getItem(MUTE_KEY);
  return v === "1";
}

export async function setSoundMuted(muted: boolean): Promise<void> {
  await AsyncStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}
