export * from "./types";
export { CATALOG, productById } from "./catalog";
export {
  type ProductStore,
  InMemoryProductStore,
  normalizeProduct,
  mergeCatalog,
} from "./productStore";
export { recommend, computeTarget } from "./recommend";
export {
  idealOffering,
  scoreForSlot,
  productUsage,
  type Offering,
  type OfferingSlot,
  type OfferingSlotResult,
  type ScoredProduct,
  type UsageGuide,
} from "./offering";
export { buildSchedule, formatClock } from "./schedule";
export type { FuelingCue, FuelingSchedule, CueKind, ScheduleOptions } from "./schedule";
