import { habitatOptions, type HabitatId } from "./habitatCatalog";

const SELECTED_HABITAT_KEY = "profile:selected-habitat";
const DEFAULT_HABITAT_ID: HabitatId = "log-pond";

export function getSelectedHabitatId(): HabitatId {
  const savedId = window.localStorage.getItem(SELECTED_HABITAT_KEY);
  const isValid = habitatOptions.some((habitat) => habitat.id === savedId);

  return isValid ? (savedId as HabitatId) : DEFAULT_HABITAT_ID;
}

export function saveSelectedHabitatId(habitatId: HabitatId) {
  window.localStorage.setItem(SELECTED_HABITAT_KEY, habitatId);
}
