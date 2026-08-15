/**
 * Spanish copy for the service catalog (labels, conditional questions and
 * answer options). Keeps `src/lib/services.ts` as the single structural source
 * of truth: only the display text is translated here, never the stored values.
 */
import type { ServiceKey } from "@/lib/services";

export const SERVICE_ES: Record<ServiceKey, { label: string; blurb: string }> = {
  oil_filter: { label: "Aceite y filtro", blurb: "Cambio de aceite y filtro de aceite" },
  brakes: { label: "Frenos", blurb: "Balatas, discos, líquido de frenos, fallas de frenado" },
  filters: { label: "Filtros", blurb: "Filtro de aire del motor y de cabina" },
  fluid_service: {
    label: "Servicio de fluidos",
    blurb: "Frenos, refrigerante, transmisión, diferencial",
  },
  maintenance: {
    label: "Mantenimiento",
    blurb: "Servicio por kilometraje, bujías, plumas",
  },
  battery: { label: "Batería", blurb: "Reemplazo y fallas de arranque" },
  diagnostics: { label: "Diagnóstico", blurb: "Luces de advertencia, eléctrico, manejo" },
  other: { label: "Otra reparación ligera", blurb: "Reparaciones menores no listadas aquí" },
};

/** Keyed by `${serviceKey}.${questionId}`. */
export const QUESTION_ES: Record<
  string,
  { label: string; hint?: string; placeholder?: string; options?: Record<string, string> }
> = {
  "brakes.brake_area": {
    label: "¿Qué eje?",
    options: {
      front: "Delantero",
      rear: "Trasero",
      both: "Delantero y trasero",
      not_sure: "No estoy seguro",
    },
  },
  "brakes.brake_concern": {
    label: "¿Qué está pasando?",
    hint: "Opcional — selecciona todo lo que aplique.",
    options: {
      pads: "Balatas",
      pads_rotors: "Balatas y discos",
      noise_vibration: "Ruido / vibración",
      warning: "Luz de frenos",
      not_sure: "No estoy seguro",
    },
  },
  "filters.filter_type": {
    label: "¿Qué filtro?",
    options: {
      engine_air: "Filtro de aire del motor",
      cabin_air: "Filtro de aire de cabina",
      both: "Ambos",
      not_sure: "No estoy seguro",
    },
  },
  "fluid_service.fluid_type": {
    label: "¿Qué fluidos?",
    hint: "Selecciona todo lo que aplique.",
    options: {
      brake: "Líquido de frenos",
      coolant: "Refrigerante",
      transmission: "Transmisión",
      differential: "Diferencial",
      other: "Otro",
      not_sure: "No estoy seguro",
    },
  },
  "maintenance.maintenance_type": {
    label: "¿Qué necesitas?",
    hint: "Selecciona todo lo que aplique.",
    options: {
      spark_plugs: "Bujías",
      scheduled: "Servicio por kilometraje",
      wipers: "Plumas limpiaparabrisas",
      other: "Otro mantenimiento",
      not_sure: "No sé qué necesito",
    },
  },
  "battery.battery_concern": {
    label: "¿Qué estás notando?",
    hint: "Selecciona todo lo que aplique.",
    options: {
      replacement: "Reemplazo de batería",
      no_start: "No arranca",
      slow_crank: "Arranca lento",
      not_sure: "No estoy seguro",
    },
  },
  "diagnostics.concern": {
    label: "Describe la falla",
    placeholder: "Luz de motor, ruido, falla eléctrica, no arranca…",
  },
  "other.request": {
    label: "¿Qué necesita tu vehículo?",
    placeholder: "Cuéntanos qué te gustaría que atendamos.",
  },
};

export const PHOTO_PROMPTS_ES: Partial<Record<ServiceKey, string>> = {
  diagnostics: "Agrega una foto de las luces de advertencia o de lo relacionado con la falla.",
  other: "Agrega fotos si hay algo que quieras mostrarnos.",
  brakes: "Fotos de las ruedas, los frenos o alguna luz de advertencia pueden ayudar.",
  battery: "Una foto de la batería o de la luz de advertencia puede ayudar.",
};

/** Engine / drivetrain fallback wording used on the Vehicle step. */
export const VEHICLE_OPTION_ES: Record<string, string> = {
  "not-sure": "No estoy seguro",
  fwd: "Tracción delantera (FWD)",
  rwd: "Tracción trasera (RWD)",
  awd: "Tracción integral (AWD)",
  "4wd": "4x4 (4WD)",
  unknown: "No estoy seguro",
};
