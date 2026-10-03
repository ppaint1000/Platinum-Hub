// A "Wash" or "Exterior Wash" line in Other items is priced per hour, so its
// Qty is hours of work. Those hours count towards a costing's Total Hours
// (and so its scheduling) even though the line is costed as an item, not at
// the labour rate.
export function isWashItem(description: string) {
  return /^(exterior\s+)?wash\b/i.test(description.trim());
}

export function washItemHours(items: { description: string; quantity: number }[]) {
  return items
    .filter((i) => isWashItem(i.description))
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
}
