export type Category =
  | "museo"
  | "natura"
  | "fattoria"
  | "sport"
  | "laboratorio"
  | "scienza"
  | "biblioteca"
  | "gita"
  | "festa"
  | "spettacolo";

export type Setting = "indoor" | "outdoor" | "mixed";
export type WeatherFit = "any" | "dry_only" | "rain_ok";
export type CostBand = "free" | "low" | "mid" | "high";
export type ContentStatus = "draft" | "da_verificare" | "published" | "archived";

export interface Activity {
  slug: string;
  title: string;
  category: Category;
  description: string;
  minAge: number;
  maxAge: number;
  multiAgeNote: string;
  setting: Setting;
  weatherFit: WeatherFit;
  costBand: CostBand;
  priceNote: string;
  durationMin: number | null;
  bookingRequired: boolean | null;
  address: string;
  zone: string;
  lat: number | null;
  lng: number | null;
  openingNote: string;
  sourceUrl: string;
  status: ContentStatus;
  isDemo: boolean;
  /** Optional validity window (ISO dates) — used by dated events. */
  availableFrom?: string | null;
  availableTo?: string | null;
  /** Present only for dated events (castagnata, spettacolo, laboratorio in biblioteca…). */
  event?: EventInfo | null;
}

export interface EventInfo {
  /** ISO date YYYY-MM-DD (first day). */
  date: string;
  /** ISO date of the last day, for multi-day events. */
  endDate?: string | null;
  /** "HH:MM", local time. */
  startTime?: string | null;
  endTime?: string | null;
  organizer?: string | null;
  /** Where it came from: automatic agenda reading, or added by hand (flyer, WhatsApp…). */
  origin: "agenda" | "manuale";
  /** Approximate position (zone centroid) instead of the exact address. */
  approxPosition?: boolean;
}

export type FamilyBudget = "free" | "upto20" | "20to50" | "over50";
export type SettingPreference = "indoor" | "outdoor" | "any";

export interface Family {
  id: string;
  email: string;
  zone: string;
  lat: number;
  lng: number;
  radiusKm: number;
  childrenAges: number[];
  budget: FamilyBudget;
  preference: SettingPreference;
  interests: Category[];
}

export interface WeekendWeather {
  /** Max precipitation probability (0-100) across Saturday and Sunday. */
  rainProbability: number | null;
  rainy: boolean;
  tempMax: number | null;
  saturday: string | null;
  sunday: string | null;
  fetchedAt: string;
  source: "open-meteo" | "fallback";
}

export type Compatibility = "all_children" | "adaptable" | "partial" | "none";

export interface ScoredActivity {
  activity: Activity;
  compatibility: Compatibility;
  distanceKm: number | null;
  score: number;
  breakdown: { age: number; weather: number; distance: number };
  flags: string[];
}

export interface Recommendation {
  familyId: string;
  ideas: ScoredActivity[];
  planB: ScoredActivity | null;
  weather: WeekendWeather;
  generatedAt: string;
  excludedCount: number;
}
