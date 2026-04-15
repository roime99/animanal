import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View, type ViewStyle } from "react-native";

import type { BgFlash } from "../hooks/useGameCyclingBackground";
import { BG_CYCLE_SOURCES, BG_GREEN, BG_RED } from "../hooks/useGameCyclingBackground";

/** Incoming layer only — outgoing stays at 1 so we never blend through the underfill (no “dip” darker). */
const PHASE_MS = 720;
/** Under the images — only visible if images fail to cover. */
const UNDERFILL = "#0b0b0c";

const AnimatedImage = Animated.createAnimatedComponent(Image);

type Props = {
  cycleIndex: number;
  flash: BgFlash;
  /** Semi-transparent layer over the artwork (gameplay chrome). */
  overlayStyle?: ViewStyle;
  children: ReactNode;
};

/**
 * Two `AnimatedImage` layers always mounted. Cross-dissolve is **incoming-only** (fade0→1 on top) with
 * outgoing kept at opacity 1, so compositing matches (1−t)·out + t·in and brightness does not dip toward
 * the dark plate. Sibling order is swapped so the incoming layer is always drawn above the outgoing layer.
 */
export function GameCyclingBackdrop({ cycleIndex, flash, overlayStyle, children }: Props) {
  const [idx0, setIdx0] = useState(cycleIndex);
  const [idx1, setIdx1] = useState(cycleIndex);
  const [armTick, setArmTick] = useState(0);
  /** Which slot (0|1) is the settled “front” layer; matches `visibleLayer` ref until we commit a transition. */
  const [displayed, setDisplayed] = useState<0 | 1>(0);

  const visibleLayer = useRef<0 | 1>(0);
  const settledRef = useRef(cycleIndex);
  const op0 = useRef(new Animated.Value(1)).current;
  const op1 = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const armedTarget = useRef<number | null>(null);

  const snapToVisible = () => {
    const vis = visibleLayer.current;
    op0.setValue(vis === 0 ? 1 : 0);
    op1.setValue(vis === 1 ? 1 : 0);
  };

  useEffect(() => {
    if (cycleIndex === settledRef.current) {
      return;
    }

    animRef.current?.stop();
    snapToVisible();

    const vis = visibleLayer.current;
    const hid = vis === 0 ? 1 : 0;
    armedTarget.current = cycleIndex;

    if (hid === 1) {
      setIdx1(cycleIndex);
    } else {
      setIdx0(cycleIndex);
    }
    setArmTick((t) => t + 1);
  }, [cycleIndex]);

  useEffect(() => {
    const target = armedTarget.current;
    if (target === null) return;

    const vis = visibleLayer.current;
    const hid = vis === 0 ? 1 : 0;
    const hiddenIdx = hid === 0 ? idx0 : idx1;
    if (hiddenIdx !== target) return;

    animRef.current?.stop();

    const outgoingOp = vis === 0 ? op0 : op1;
    const incomingOp = hid === 0 ? op0 : op1;
    outgoingOp.setValue(1);
    incomingOp.setValue(0);

    const anim = Animated.timing(incomingOp, {
      toValue: 1,
      duration: PHASE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      animRef.current = null;
      if (!finished) return;
      visibleLayer.current = hid;
      settledRef.current = target;
      armedTarget.current = null;
      setDisplayed(hid);
      snapToVisible();
    });
  }, [idx0, idx1, armTick]);

  useEffect(() => {
    return () => {
      animRef.current?.stop();
    };
  }, []);

  const layer0 = (
    <AnimatedImage
      key="layer0"
      source={BG_CYCLE_SOURCES[idx0]}
      style={[StyleSheet.absoluteFill, styles.coverImg, { opacity: op0 }]}
      resizeMode="cover"
      fadeDuration={0}
    />
  );
  const layer1 = (
    <AnimatedImage
      key="layer1"
      source={BG_CYCLE_SOURCES[idx1]}
      style={[StyleSheet.absoluteFill, styles.coverImg, { opacity: op1 }]}
      resizeMode="cover"
      fadeDuration={0}
    />
  );

  return (
    <View style={styles.root}>
      <View style={styles.imageStack} pointerEvents="none">
        {displayed === 0 ? (
          <>
            {layer0}
            {layer1}
          </>
        ) : (
          <>
            {layer1}
            {layer0}
          </>
        )}
        {flash !== "none" ? (
          <Image
            source={flash === "green" ? BG_GREEN : BG_RED}
            style={[StyleSheet.absoluteFill, styles.coverImg]}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : null}
      </View>
      <View style={[{ flex: 1, zIndex: 1 }, overlayStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UNDERFILL },
  imageStack: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: UNDERFILL,
  },
  coverImg: {
    width: "100%",
    height: "100%",
  },
});
