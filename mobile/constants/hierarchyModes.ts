/** Must match `ALLOWED_HIERARCHY_MODES` / query `hierarchy_mode` on the API (lowercase). */
export const HIERARCHY_MODE_OPTIONS: { id: string; label: string; blurb: string }[] = [
  { id: "birds", label: "Birds", blurb: "Path must include a Birds segment (e.g. Animals/Birds/…)." },
  { id: "amphibians", label: "Amphibians", blurb: "Path includes an Amphibians segment." },
  { id: "arthropods", label: "Arthropods", blurb: "Path includes an Arthropods segment." },
  { id: "fish", label: "Fish", blurb: "Path includes /Fish/ (avoids random “fish” inside other words)." },
  { id: "mammals", label: "Mammals", blurb: "Path includes /Mammals/ (includes Carnivora too)." },
  { id: "carnivora", label: "Carnivora", blurb: "Path includes /Carnivora/." },
  { id: "reptiles", label: "Reptiles", blurb: "Path includes a Reptiles segment." },
];
