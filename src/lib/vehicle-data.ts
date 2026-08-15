/**
 * Suggestion data for the vehicle fields.
 *
 * Everything here is a *suggestion* source only — the combobox always accepts a
 * freely typed value, so a make/model we've never heard of still submits fine.
 * The curated lists below are the offline baseline; models can be enriched from
 * the NHTSA vPIC service (see `vehicle-data.functions.ts`).
 */

/** Model years offered when a year field opens, newest first. */
export function yearOptions(now = new Date()): string[] {
  // vPIC publishes next model year mid-calendar-year, so include now + 1.
  const newest = now.getFullYear() + 1;
  const oldest = 1981; // 17-character VINs (and useful part data) start here.
  const years: string[] = [];
  for (let y = newest; y >= oldest; y -= 1) years.push(String(y));
  return years;
}

/** Makes sold in volume in the US market, plus common commercial brands. */
export const MAKES: string[] = [
  "Acura",
  "Alfa Romeo",
  "Audi",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chrysler",
  "Dodge",
  "Fiat",
  "Ford",
  "Freightliner",
  "Genesis",
  "GMC",
  "Honda",
  "Hummer",
  "Hyundai",
  "Infiniti",
  "Isuzu",
  "Jaguar",
  "Jeep",
  "Kia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lucid",
  "Maserati",
  "Mazda",
  "Mercedes-Benz",
  "Mercury",
  "MINI",
  "Mitsubishi",
  "Nissan",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Rivian",
  "Saab",
  "Saturn",
  "Scion",
  "Smart",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
];

/** Offline model baseline, used before/instead of the remote lookup. */
const MODELS: Record<string, string[]> = {
  acura: ["ILX", "Integra", "MDX", "RDX", "RLX", "TL", "TLX", "TSX", "ZDX"],
  audi: ["A3", "A4", "A5", "A6", "A7", "A8", "Q3", "Q5", "Q7", "Q8", "e-tron", "S4", "TT"],
  bmw: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7", "i4", "iX", "M3"],
  buick: ["Enclave", "Encore", "Encore GX", "Envision", "LaCrosse", "Regal"],
  cadillac: ["ATS", "CT4", "CT5", "CTS", "Escalade", "SRX", "XT4", "XT5", "XT6"],
  chevrolet: [
    "Blazer",
    "Bolt EV",
    "Camaro",
    "Colorado",
    "Corvette",
    "Cruze",
    "Equinox",
    "Express",
    "Impala",
    "Malibu",
    "Silverado 1500",
    "Silverado 2500HD",
    "Sonic",
    "Suburban",
    "Tahoe",
    "Traverse",
    "Trax",
  ],
  chrysler: ["300", "Pacifica", "Town & Country", "Voyager"],
  dodge: ["Challenger", "Charger", "Durango", "Grand Caravan", "Journey", "Ram 1500"],
  ford: [
    "Bronco",
    "Bronco Sport",
    "Edge",
    "Escape",
    "Expedition",
    "Explorer",
    "F-150",
    "F-250",
    "F-350",
    "Fiesta",
    "Focus",
    "Fusion",
    "Maverick",
    "Mustang",
    "Mustang Mach-E",
    "Ranger",
    "Transit",
    "Transit Connect",
  ],
  genesis: ["G70", "G80", "G90", "GV70", "GV80"],
  gmc: ["Acadia", "Canyon", "Savana", "Sierra 1500", "Sierra 2500HD", "Terrain", "Yukon", "Yukon XL"],
  honda: [
    "Accord",
    "Civic",
    "CR-V",
    "CR-Z",
    "Fit",
    "HR-V",
    "Insight",
    "Odyssey",
    "Passport",
    "Pilot",
    "Prologue",
    "Ridgeline",
  ],
  hyundai: [
    "Accent",
    "Elantra",
    "Ioniq 5",
    "Kona",
    "Palisade",
    "Santa Cruz",
    "Santa Fe",
    "Sonata",
    "Tucson",
    "Veloster",
    "Venue",
  ],
  infiniti: ["G35", "G37", "Q50", "Q60", "QX50", "QX60", "QX80"],
  jeep: [
    "Cherokee",
    "Compass",
    "Gladiator",
    "Grand Cherokee",
    "Grand Wagoneer",
    "Liberty",
    "Patriot",
    "Renegade",
    "Wrangler",
  ],
  kia: ["Carnival", "EV6", "Forte", "K5", "Niro", "Optima", "Rio", "Seltos", "Sorento", "Soul", "Sportage", "Telluride"],
  "land rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Velar"],
  lexus: ["ES 350", "GX 460", "IS 300", "NX 300", "RX 350", "RX 450h", "TX 350", "UX 250h"],
  lincoln: ["Aviator", "Corsair", "MKC", "MKX", "MKZ", "Nautilus", "Navigator"],
  mazda: ["CX-30", "CX-5", "CX-50", "CX-9", "CX-90", "Mazda3", "Mazda6", "MX-5 Miata"],
  "mercedes-benz": ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "Sprinter"],
  mini: ["Clubman", "Cooper", "Cooper Countryman", "Cooper S"],
  mitsubishi: ["Eclipse Cross", "Mirage", "Outlander", "Outlander Sport"],
  nissan: [
    "Altima",
    "Armada",
    "Frontier",
    "Kicks",
    "Leaf",
    "Maxima",
    "Murano",
    "NV200",
    "Pathfinder",
    "Rogue",
    "Sentra",
    "Titan",
    "Versa",
  ],
  porsche: ["911", "Cayenne", "Macan", "Panamera", "Taycan"],
  ram: ["1500", "2500", "3500", "ProMaster", "ProMaster City"],
  rivian: ["R1S", "R1T"],
  subaru: ["Ascent", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback", "WRX"],
  tesla: ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
  toyota: [
    "4Runner",
    "Avalon",
    "Camry",
    "Corolla",
    "Corolla Cross",
    "GR86",
    "Highlander",
    "Land Cruiser",
    "Prius",
    "RAV4",
    "Sequoia",
    "Sienna",
    "Tacoma",
    "Tundra",
    "Venza",
  ],
  volkswagen: ["Atlas", "Golf", "GTI", "ID.4", "Jetta", "Passat", "Taos", "Tiguan"],
  volvo: ["S60", "S90", "V60", "XC40", "XC60", "XC90"],
};

/** Trim suggestions. Model-specific first, then a per-make fallback ladder. */
const TRIMS_BY_MODEL: Record<string, string[]> = {
  "honda|civic": ["LX", "Sport", "EX", "EX-L", "Touring", "Si", "Type R"],
  "honda|accord": ["LX", "Sport", "EX", "EX-L", "Sport-L", "Touring", "Hybrid"],
  "honda|cr-v": ["LX", "EX", "EX-L", "Sport", "Sport Touring", "Touring"],
  "toyota|camry": ["LE", "SE", "XLE", "XSE", "TRD", "Hybrid LE", "Hybrid XLE"],
  "toyota|corolla": ["L", "LE", "SE", "XLE", "XSE", "Hybrid LE", "Nightshade"],
  "toyota|rav4": ["LE", "XLE", "XLE Premium", "Adventure", "TRD Off-Road", "Limited", "Hybrid XSE"],
  "toyota|tacoma": ["SR", "SR5", "TRD Sport", "TRD Off-Road", "TRD Pro", "Limited"],
  "toyota|tundra": ["SR", "SR5", "Limited", "Platinum", "1794", "TRD Pro"],
  "ford|f-150": ["XL", "XLT", "STX", "Lariat", "King Ranch", "Platinum", "Tremor", "Raptor"],
  "ford|explorer": ["Base", "XLT", "Limited", "ST-Line", "ST", "Platinum", "King Ranch"],
  "ford|escape": ["S", "SE", "SEL", "Titanium", "ST-Line", "Active", "Platinum"],
  "ford|mustang": ["EcoBoost", "EcoBoost Premium", "GT", "GT Premium", "Dark Horse"],
  "chevrolet|silverado 1500": ["WT", "Custom", "Custom Trail Boss", "LT", "RST", "LT Trail Boss", "LTZ", "High Country"],
  "chevrolet|equinox": ["LS", "LT", "RS", "Premier", "Activ"],
  "chevrolet|tahoe": ["LS", "LT", "RST", "Z71", "Premier", "High Country"],
  "jeep|wrangler": ["Sport", "Sport S", "Willys", "Sahara", "Rubicon", "High Altitude", "4xe"],
  "jeep|grand cherokee": ["Laredo", "Altitude", "Limited", "Trailhawk", "Overland", "Summit"],
  "nissan|altima": ["S", "SV", "SR", "SL", "Platinum"],
  "nissan|rogue": ["S", "SV", "SL", "Platinum"],
  "hyundai|elantra": ["SE", "SEL", "Limited", "N Line", "Blue Hybrid"],
  "hyundai|tucson": ["SE", "SEL", "XRT", "N Line", "Limited", "Hybrid Blue"],
  "kia|sorento": ["LX", "S", "EX", "SX", "SX Prestige", "X-Line"],
  "subaru|outback": ["Base", "Premium", "Onyx Edition", "Limited", "Touring", "Wilderness"],
  "subaru|forester": ["Base", "Premium", "Sport", "Limited", "Touring", "Wilderness"],
  "ram|1500": ["Tradesman", "Big Horn", "Laramie", "Rebel", "Limited Longhorn", "Limited", "TRX"],
  "tesla|model 3": ["Standard Range", "Long Range", "Performance"],
  "tesla|model y": ["Long Range", "Performance"],
  "lexus|rx 350": ["Base", "Premium", "Premium Plus", "Luxury", "F Sport Handling"],
};

const TRIMS_BY_MAKE: Record<string, string[]> = {
  bmw: ["sDrive", "xDrive", "M Sport", "M"],
  audi: ["Premium", "Premium Plus", "Prestige", "S line"],
  "mercedes-benz": ["Base", "4MATIC", "AMG Line", "AMG"],
  volkswagen: ["S", "SE", "SEL", "SEL Premium", "R-Line"],
  mazda: ["Sport", "Select", "Preferred", "Premium", "Turbo"],
  gmc: ["Pro", "SLE", "Elevation", "SLT", "AT4", "Denali"],
  honda: ["LX", "Sport", "EX", "EX-L", "Touring"],
  toyota: ["L", "LE", "SE", "XLE", "XSE", "Limited", "Platinum"],
  ford: ["S", "SE", "SEL", "XLT", "Lariat", "Titanium", "Limited"],
  chevrolet: ["LS", "LT", "RS", "LTZ", "Premier", "High Country"],
  nissan: ["S", "SV", "SR", "SL", "Platinum"],
  hyundai: ["SE", "SEL", "N Line", "Limited"],
  kia: ["LX", "S", "EX", "SX", "SX Prestige"],
  subaru: ["Base", "Premium", "Sport", "Limited", "Touring"],
};

const GENERIC_TRIMS = ["Base", "Sport", "Premium", "Limited", "Touring", "Platinum"];

const key = (value: string) => value.trim().toLowerCase();

/** Offline model suggestions for a make. Empty when the make is unknown. */
export function modelSuggestions(make: string): string[] {
  return MODELS[key(make)] ?? [];
}

/** Trim suggestions, narrowed by model when we have model-specific data. */
export function trimSuggestions(make: string, model: string): string[] {
  const exact = TRIMS_BY_MODEL[`${key(make)}|${key(model)}`];
  if (exact) return exact;
  return TRIMS_BY_MAKE[key(make)] ?? GENERIC_TRIMS;
}

/** True when a make has offline model data, so a failed lookup still helps. */
export function hasOfflineModels(make: string): boolean {
  return Boolean(MODELS[key(make)]);
}

/**
 * Forgiving, case-insensitive ranking: prefix matches first, then word-start
 * matches, then anywhere in the string. Order within a tier is preserved.
 */
export function rankSuggestions(options: string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const unique = options.filter((o) => {
    const k = o.toLowerCase();
    if (!o.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!q) return unique.slice(0, limit);

  const prefix: string[] = [];
  const wordStart: string[] = [];
  const anywhere: string[] = [];
  for (const option of unique) {
    const lower = option.toLowerCase();
    if (lower.startsWith(q)) prefix.push(option);
    else if (new RegExp(`\\b${escapeRegExp(q)}`).test(lower)) wordStart.push(option);
    else if (lower.includes(q)) anywhere.push(option);
  }
  return [...prefix, ...wordStart, ...anywhere].slice(0, limit);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
