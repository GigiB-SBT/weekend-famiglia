import type { Family } from "@/lib/engine/types";
import { ZONES } from "./zones";

/** Fictional pilot families for demo mode. No real people, no minors' names. */
export const DEMO_FAMILIES: Family[] = [
  {
    id: "demo-5-9-11",
    email: "famiglia.a@example.com",
    zone: "Santo Stefano",
    ...ZONES["Santo Stefano"],
    radiusKm: 10,
    childrenAges: [5, 9, 11],
    budget: "upto20",
    preference: "any",
    interests: ["natura", "scienza"],
  },
  {
    id: "demo-3-6",
    email: "famiglia.b@example.com",
    zone: "Navile",
    ...ZONES.Navile,
    radiusKm: 20,
    childrenAges: [3, 6],
    budget: "free",
    preference: "outdoor",
    interests: ["fattoria", "natura"],
  },
  {
    id: "demo-12-14",
    email: "famiglia.c@example.com",
    zone: "Savena",
    ...ZONES.Savena,
    radiusKm: 30,
    childrenAges: [12, 14],
    budget: "20to50",
    preference: "indoor",
    interests: ["sport", "laboratorio"],
  },
];
