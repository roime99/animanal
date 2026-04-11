import { ReactNode, useRef } from "react";
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

type Props = Omit<PressableProps, "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (1 = no shrink). */
  scaleTo?: number;
};

export function ScalePress({ children, style, scaleTo = 0.96, disabled, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleIn = (e: Parameters<NonNullable<PressableProps["onPressIn"]>>[0]) => {
    if (!disabled) {
      Animated.spring(scale, {
        toValue: scaleTo,
        friction: 6,
        tension: 380,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(e);
  };

  const handleOut = (e: Parameters<NonNullable<PressableProps["onPressOut"]>>[0]) => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 280,
      useNativeDriver: true,
    }).start();
    onPressOut?.(e);
  };

  return (
    <Pressable disabled={disabled} onPressIn={handleIn} onPressOut={handleOut} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
