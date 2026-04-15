import { Text, TextInput } from "react-native";

let applied = false;

/** Set default `fontFamily` on `Text` / `TextInput` once custom fonts are loaded. */
export function applyAppFont(family: string) {
  if (applied) return;
  applied = true;

  const extra = { fontFamily: family };

  const T = Text as unknown as { defaultProps?: { style?: unknown } };
  T.defaultProps = T.defaultProps ?? {};
  const ps = T.defaultProps.style;
  T.defaultProps.style = ps == null ? extra : Array.isArray(ps) ? [...ps, extra] : [ps, extra];

  const TI = TextInput as unknown as { defaultProps?: { style?: unknown } };
  TI.defaultProps = TI.defaultProps ?? {};
  const qs = TI.defaultProps.style;
  TI.defaultProps.style = qs == null ? extra : Array.isArray(qs) ? [...qs, extra] : [qs, extra];
}
