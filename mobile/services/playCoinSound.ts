import { Audio } from "expo-av";

let coinSound: Audio.Sound | null = null;
let modeReady = false;

export async function playCoinSound(opts?: { muted?: boolean }): Promise<void> {
  if (opts?.muted) return;
  try {
    if (!modeReady) {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      modeReady = true;
    }
    if (!coinSound) {
      const { sound } = await Audio.Sound.createAsync(require("../assets/coin.wav"), { shouldPlay: false, volume: 0.85 });
      coinSound = sound;
    }
    await coinSound.setPositionAsync(0);
    await coinSound.playAsync();
  } catch {
    /* ignore — sound is optional on unsupported runtimes */
  }
}
