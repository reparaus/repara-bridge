/**
 * Service-advisor intake playbooks (provider-agnostic, no AI vendor knowledge).
 *
 * These are the structured complaint families and the pre-check dimensions a
 * professional dealership service advisor would work through before a repair
 * order reaches a technician. The AI classifies the customer's concern and then
 * chooses the RELEVANT dimensions from the matching playbook — the playbooks
 * keep intake consistent and professional, the model keeps it flexible.
 *
 * Nothing here diagnoses: every dimension asks about an observable symptom or
 * condition the customer can actually report.
 */

export type ComplaintFamily =
  | "noise"
  | "vibration"
  | "fluid_leak"
  | "warning_light"
  | "starting"
  | "engine_performance"
  | "overheating"
  | "braking"
  | "steering"
  | "suspension"
  | "transmission"
  | "hvac"
  | "electrical"
  | "battery_charging"
  | "maintenance"
  | "fluid_service"
  | "tire_wheel"
  | "drivability"
  | "fuel_economy"
  | "odor"
  | "interior_feature"
  | "exterior_feature"
  | "intermittent"
  | "other";

/** Compact playbook text sent to the model. Keep terse — this is prompt budget. */
export const PLAYBOOKS: Record<ComplaintFamily, string> = {
  noise: `NOISE: sound type (humming/hum, whining, squealing, chirping, clicking, clunking, rattling, grinding, knocking, buzzing, scraping, popping, ticking, other-describe, not sure); location (engine area, front, rear, underneath, front left/right, rear left/right, inside cabin, unsure); when it occurs (starting, idling, accelerating, steady cruise, decelerating/coasting, braking, turning, shifting, over bumps, rough roads, highway speed, low-speed maneuvering, all the time, intermittently) — multi_choice; whether vehicle SPEED changes it (louder with speed, quieter, faster with speed, only in a speed range, no effect, unsure) and rough speed range if known; whether ENGINE RPM / throttle changes it (only when engine revs, when pressing accelerator, heavy vs light acceleration, coasting, when shifting); TEMPERATURE (only cold, mostly cold, only after warm-up, hot or cold, unsure) — critical for startup noises; ROAD SURFACE only for bump/suspension-type noise (smooth roads, rough pavement, speed bumps, potholes, driveway entrances, uneven roads, turning into a driveway); WEATHER only if plausibly relevant (rain, cold, heat, humidity, after washing, no effect); frequency/reproducibility (every time, most of the time, occasionally, happened once, can reproduce it, unsure).
Startup noise: cold start only?, also when warm?, how long it lasts, stops right after starting, every startup or intermittent, what it sounds like. Never ask road-surface questions for a startup/stationary noise.
Bump/clunk noise: corner/side, individual bumps vs rough roads, low vs higher speed, braking or turning influence, driveway entrances, consistency. Do not ask engine-RPM questions.`,
  vibration: `VIBRATION: where felt (steering wheel, seat, floor, brake pedal, whole vehicle, unsure); when (idle, acceleration, braking, steady cruise, highway speed, turning) — multi_choice; approximate speed range; what changes it (vehicle speed, engine RPM, acceleration, braking); cold vs warm if relevant; consistency. Symptoms only — never mention balance, mounts, rotors or any cause.`,
  fluid_leak: `FLUID LEAK: where underneath (front/middle/rear, driver side/passenger side/center, unsure); fluid colour; thin/watery vs oily/thick; amount (a few drops, small spot, puddle, unsure); when (while parked, after driving, both); any warning lights; any recent service. Never state which fluid it is — say only that it helps narrow which system to inspect.`,
  warning_light: `WARNING LIGHT: which light or dashboard message (free_text preserved exactly, plus common choices); solid or flashing; when it began; whether the vehicle drives differently; whether it stays on every drive or comes and goes; anything that happened right before; any recent service. Never name a failed part. Never say whether it is safe to drive.`,
  starting: `STARTING / NO-START, customer-friendly wording: when you press start, does the engine turn over ("rrr-rrr") but not start, crank slowly, click once, or is it completely silent; are the dash lights normal or dim; every time or sometimes; cold or hot related; recent jump start or battery replacement; any warning messages.`,
  engine_performance: `ENGINE PERFORMANCE: what is felt (lack of power, hesitation, surging, rough idle, stalling, misfire feel); when (cold start, idle, light throttle, hard acceleration, cruising, uphill); speed/RPM conditions; warning lights; fuel-fill or service right before it started; frequency.`,
  overheating: `OVERHEATING / COOLING: does the temperature gauge rise, warning light or message, coolant loss or need to add coolant, steam or smell, happens while driving vs idling in traffic, A/C on vs off, how quickly it rises, recent cooling-system work. Never say whether it is safe to keep driving.`,
  braking: `BRAKING: symptom (noise, vibration, pulling, soft pedal, hard pedal, pedal goes down slowly, warning light) — multi_choice; light vs heavy braking; from low vs highway speed; vibration in steering wheel vs pedal; how long it has been happening; recent brake work.`,
  steering: `STEERING: noise while turning, effort (heavy/light), pulling to one side, vibration, position (straight ahead, slight turn, full lock), low speed vs highway, stationary turning, road surface, warning lights, constant vs intermittent.`,
  suspension: `SUSPENSION / RIDE: noise or feel (clunk, thud, bounce, harsh ride, leaning, sagging); which corner or side; smooth vs rough roads, speed bumps, potholes, driveway entrances; low vs higher speed; while braking or turning; consistency.`,
  transmission: `TRANSMISSION / SHIFTING: automatic or manual if unknown; which change (from a stop, upshift, downshift, into Drive or Reverse, at low speed, on acceleration); delay before engaging; harsh or jerky shift; feels like slipping or RPM rises without speed; noise; cold vs warm; warning message. Never say the transmission has failed.`,
  hvac: `A/C & HEATING: no cold air vs weak cooling (or no heat); driver vs passenger side difference; cooling while moving vs stopped; blower/fan working and any speed that fails; noise; smell; constant or intermittent; outside temperature when it happens; recent A/C service.`,
  electrical: `ELECTRICAL: which feature fails; completely dead vs intermittent; does turning the vehicle off and on restore it; warning messages; happens after rain, heat or cold; anything else failing at the same time; recent battery work, repair or accessory installation. Never guess modules.`,
  battery_charging: `BATTERY / CHARGING: needs a jump start, slow crank, dies overnight or over days, battery warning light, accessories dimming, battery age or last replacement, recent long periods parked, any accessories added.`,
  maintenance: `MAINTENANCE: if the customer already knows what they want (e.g. an oil change), do NOT interrogate them — ask nothing, or at most one genuinely useful question. Otherwise: approximate mileage, which services were done recently, whether records are available.`,
  fluid_service: `FLUID SERVICE HISTORY: approximate current mileage; which fluids they know have been changed (engine oil, brake, coolant, transmission, differential, unsure); roughly when or at what mileage; whether service records are available; which fluids they are unsure about. "I'm not sure" must always be selectable. Never claim a specific fluid service is required.`,
  tire_wheel: `TIRE / WHEEL: which tire or corner, losing air, visible damage, noise, vibration, pulling, TPMS light, how often air must be added, recent tire work.`,
  drivability: `DRIVABILITY: what the vehicle does, when it happens, speed and load conditions, warning lights, reproducibility, whether anything changed right before it started.`,
  fuel_economy: `FUEL ECONOMY: how much worse and over what period, driving type (city/highway/short trips), anything else noticed (warning light, smell, performance change), recent service or fuel change.`,
  odor: `SMELL / ODOR: what it smells like (sweet, burning oil, burning rubber, fuel, rotten egg, musty, other-describe); where noticed (inside cabin, outside, engine area, wheels); when (engine running, A/C or heat on, after driving, while braking); constant or occasional; any visible smoke or fluid.`,
  interior_feature: `INTERIOR FEATURE: which feature, what it does or fails to do, always or sometimes, when it started, any message on the display, anything installed or spilled recently.`,
  exterior_feature: `EXTERIOR FEATURE: which item, what it does or fails to do, always or sometimes, when it started, visible damage, recent work.`,
  intermittent: `INTERMITTENT CONCERN: exactly what happens when it occurs, how often, most recent occurrence, conditions in common (cold, hot, rain, highway, short trips), whether it can be reproduced on demand, warning lights at the time.`,
  other: `UNCLEAR / OTHER: first clarify in plain language what the customer notices, then when and under which conditions it happens, then whether it is consistent. Keep it short.`,
};

/** Families we accept back from the model. */
export const COMPLAINT_FAMILIES = Object.keys(PLAYBOOKS) as ComplaintFamily[];

export function isComplaintFamily(value: string): value is ComplaintFamily {
  return (COMPLAINT_FAMILIES as string[]).includes(value);
}

/** Catalog line used for classification, without the full playbook bodies. */
export const FAMILY_LIST = COMPLAINT_FAMILIES.join(", ");

/* --------------------- deterministic pre-classification -------------------- */

/**
 * Cheap keyword pre-classification (EN + ES). It costs nothing and lets us send
 * only the RELEVANT playbooks to the model instead of the whole catalog — the
 * model still classifies authoritatively and may return a different family,
 * which the next round then honours.
 */
const KEYWORDS: [ComplaintFamily, RegExp][] = [
  ["noise", /noise|sound|hum|whin|squeal|chirp|click|clunk|rattl|grind|knock|buzz|scrap|pop|tick|ruido|zumb|chill|rechin|golpe|traquete|clic/i],
  ["vibration", /vibrat|shak|shudder|wobbl|vibra|tiembl|tembl|cimbre/i],
  ["fluid_leak", /leak|drip|puddle|fluid on|fuga|gotea|charco|derrame|liquido|líquido/i],
  ["warning_light", /warning light|check engine|engine light|dash light|abs light|airbag light|message on the dash|luz de|testigo|check engine|tablero/i],
  ["starting", /won'?t start|wont start|no start|doesn'?t start|hard to start|crank|turn over|no arranca|no prende|cuesta arrancar|marcha/i],
  ["overheating", /overheat|temperature gauge|coolant|antifreeze|steam|sobrecalent|temperatura|refrigerante|anticongelante|vapor/i],
  ["braking", /brake|braking|pedal|freno|frena/i],
  ["steering", /steer|steering|pull(s|ing)? to|direccion|dirección|volante|jala/i],
  ["suspension", /suspension|bump|pothole|ride|strut|shock|bache|topes|amortigua|suspensi/i],
  ["transmission", /transmission|shift|gear|slipp|clutch|transmisi|cambio|velocidad(es)?|embrague|patina/i],
  ["hvac", /a\/?c\b|air condition|heater|heat(ing)? doesn|blower|defrost|aire acondicionado|calefacc|clima|ventilador/i],
  ["electrical", /electrical|window|lights don|radio|fuse|wiring|screen|electric|ventana|luces no|fusible|pantalla/i],
  ["battery_charging", /battery|jump start|alternator|dead in the morning|bateria|batería|alternador|pasar corriente/i],
  ["tire_wheel", /tire|tyre|wheel|tpms|flat|llanta|neumatic|rueda|ponchad/i],
  ["fuel_economy", /gas mileage|fuel economy|mpg|using more gas|gasta más|rendimiento de gasolina|gasolina/i],
  ["odor", /smell|odor|odour|burning|stink|olor|huele|quemad/i],
  ["engine_performance", /hesitat|stall|misfire|rough idle|no power|lack of power|surg|sputter|jalone|se apaga|falla|pierde fuerza|ralent/i],
  ["fluid_service", /fluids?\b|flush|which fluids|fluid change|fluidos|liquidos|líquidos|cambio de aceite de la transmisi/i],
  ["maintenance", /oil change|maintenance|service due|spark plug|wiper|tune up|mantenimiento|cambio de aceite|bujia|bujía|limpiaparabrisas/i],
  ["intermittent", /sometimes|intermittent|once in a while|randomly|a veces|intermitente|de vez en cuando/i],
];

/** Service-catalog keys map onto a family when the customer wrote nothing useful. */
const SERVICE_FAMILY: Record<string, ComplaintFamily> = {
  oil_filter: "maintenance",
  oil_change: "maintenance",
  maintenance: "maintenance",
  filters: "maintenance",
  fluid_service: "fluid_service",
  brakes: "braking",
  battery: "battery_charging",
  diagnostics: "other",
  suspension: "suspension",
  other: "other",
};

export function guessFamilies(text: string, serviceKeys: string[] = []): ComplaintFamily[] {
  const found: ComplaintFamily[] = [];
  for (const [family, re] of KEYWORDS) {
    if (re.test(text) && !found.includes(family)) found.push(family);
  }
  for (const key of serviceKeys) {
    const family = SERVICE_FAMILY[key];
    if (family && !found.includes(family)) found.push(family);
  }
  if (found.length === 0) found.push("other");
  // Three playbooks is plenty of guidance and keeps the prompt small.
  return found.slice(0, 3);
}
