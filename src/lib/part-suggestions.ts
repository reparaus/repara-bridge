/**
 * Starter part suggestions per service. These are only checklist prompts for
 * the provider — nothing is added to a quote automatically, no prices or part
 * numbers are implied, and fitment is never claimed.
 */
const BY_CATEGORY: Record<string, string[]> = {
  oil_service: ["Engine oil", "Oil filter", "Drain plug washer / gasket"],
  maintenance: ["Engine air filter", "Cabin air filter", "Wiper blades"],
  preventive_maintenance: ["Engine oil", "Oil filter", "Engine air filter", "Cabin air filter"],
  brakes: ["Brake pads", "Brake rotors", "Brake hardware kit", "Brake lubricant", "Brake fluid"],
  cooling: ["Coolant", "Thermostat", "Thermostat gasket / O-ring", "Radiator hose"],
  overheating: ["Coolant", "Thermostat", "Thermostat gasket / O-ring"],
  battery: ["Battery", "Battery terminal protector"],
  starting_charging: ["Battery", "Alternator", "Starter"],
  suspension: ["Shocks / struts", "Strut mount", "Sway bar links"],
  steering: ["Tie rod ends", "Power steering fluid"],
  transmission: ["Transmission fluid", "Transmission filter", "Pan gasket"],
  tires: ["Tires", "Valve stems", "TPMS service kit"],
  tpms: ["TPMS sensor", "TPMS service kit"],
  ac: ["Refrigerant", "Cabin air filter"],
};

const TEXT_HINTS: [RegExp, string][] = [
  [/oil/i, "oil_service"],
  [/brake/i, "brakes"],
  [/coolant|radiator|thermostat/i, "cooling"],
  [/battery/i, "battery"],
  [/tire/i, "tires"],
];

export function suggestParts(categoryKey: string | null, services: string[]): string[] {
  const keys = new Set<string>();
  if (categoryKey && BY_CATEGORY[categoryKey]) keys.add(categoryKey);
  for (const s of services) for (const [re, k] of TEXT_HINTS) if (re.test(s)) keys.add(k);
  return [...new Set([...keys].flatMap((k) => BY_CATEGORY[k] ?? []))].slice(0, 8);
}
