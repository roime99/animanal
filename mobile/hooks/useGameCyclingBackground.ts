import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageSourcePropType } from "react-native";

const BG_COUNT = 12;
const FLASH_MS = 1200;

export const BG_CYCLE_SOURCES: ImageSourcePropType[] = [
  require("../assets/bg/bg1.png"),
  require("../assets/bg/bg2.png"),
  require("../assets/bg/bg3.png"),
  require("../assets/bg/bg4.png"),
  require("../assets/bg/bg5.png"),
  require("../assets/bg/bg6.png"),
  require("../assets/bg/bg7.png"),
  require("../assets/bg/bg8.png"),
  require("../assets/bg/bg9.png"),
  require("../assets/bg/bg10.png"),
  require("../assets/bg/bg11.png"),
  require("../assets/bg/bg12.png"),
];

export const BG_GREEN: ImageSourcePropType = require("../assets/bg/bg_green.png");
export const BG_RED: ImageSourcePropType = require("../assets/bg/bg_red.png");

export type BgFlash = "none" | "green" | "red";

/**
 * Ping-pong cycle bg1→bg12→bg1 every 1s; pause for FLASH_MS on correct/wrong feedback.
 * Pair with GameCyclingBackdrop — do not swap ImageBackground `source` each tick (causes flicker).
 */
export function useGameCyclingBackground(active: boolean) {
  const idxRef = useRef(0);
  const dirRef = useRef(1);
  const pausedRef = useRef(false);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [flash, setFlash] = useState<BgFlash>("none");

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      let i = idxRef.current;
      const d = dirRef.current;
      let next = i + d;
      if (d === 1 && i === BG_COUNT - 1) {
        dirRef.current = -1;
        next = BG_COUNT - 2;
      } else if (d === -1 && i === 0) {
        dirRef.current = 1;
        next = 1;
      }
      idxRef.current = next;
      setCycleIndex(next);
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const flashCorrect = useCallback(() => {
    pausedRef.current = true;
    setFlash("green");
    setTimeout(() => {
      setFlash("none");
      pausedRef.current = false;
    }, FLASH_MS);
  }, []);

  const flashWrong = useCallback(() => {
    pausedRef.current = true;
    setFlash("red");
    setTimeout(() => {
      setFlash("none");
      pausedRef.current = false;
    }, FLASH_MS);
  }, []);

  return { cycleIndex, flash, flashCorrect, flashWrong };
}
