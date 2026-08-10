export const BET_TYPES = Object.freeze([
  { id: "win", label: "Win", cardinality: 1, ordered: true, slots: ["Winner"], description: "Pick the race winner." },
]);

export function getBetType(typeId) {
  return BET_TYPES.find((type) => type.id === typeId) || BET_TYPES[0];
}

export function getSelectionKey(type, horseIds) {
  const ids = horseIds.filter(Boolean);
  return (type.ordered ? ids : [...ids].sort()).join(":");
}

export function updateSelection(current, horseId, type) {
  const next = current.slice(0, type.cardinality);
  const existingIndex = next.indexOf(horseId);

  if (type.cardinality === 1) return existingIndex === 0 ? [] : [horseId];
  if (existingIndex >= 0) return next.filter((id) => id !== horseId);
  if (next.length < type.cardinality) return [...next, horseId];
  return [...next.slice(0, -1), horseId];
}

export function isSelectionComplete(selection, type) {
  return selection.length === type.cardinality && new Set(selection).size === type.cardinality;
}
