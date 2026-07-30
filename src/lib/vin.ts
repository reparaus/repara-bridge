/**
 * VIN utilities + a replaceable VIN decoding service.
 *
 * Local validation happens in the browser; decoding is delegated to a server
 * function (`decodeVinRemote`) so provider credentials never reach the client.
 * To swap providers, change that server function — nothing in the UI moves.
 *
 * Camera VIN scanning is not implemented yet. `isVinScanSupported()` reports
 * capability honestly so the UI never fakes a scan.
 */

import type { Drivetrain } from "./vehicle-config";
import { decodeVinRemote } from "./vin.functions";

export const VIN_LENGTH = 17;
const VIN_ALLOWED = /^[A-HJ-NPR-Z0-9]+$/; // no I, O or Q

export function normalizeVin(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, VIN_LENGTH);
}

export function validateVin(vin: string): { valid: boolean; message?: string } {
  const v = normalizeVin(vin);
  if (v.length === 0) return { valid: false, message: "Enter your VIN to continue." };
  if (v.length !== VIN_LENGTH)
    return {
      valid: false,
      message: `A VIN is ${VIN_LENGTH} characters. You've entered ${v.length}.`,
    };
  if (!VIN_ALLOWED.test(v))
    return { valid: false, message: "That VIN contains characters we don't recognize." };
  return { valid: true };
}

export function isCompleteVin(vin: string): boolean {
  return validateVin(vin).valid;
}

export function maskVin(vin: string): string {
  const v = normalizeVin(vin);
  if (v.length < 6) return "•".repeat(v.length);
  return `${"•".repeat(v.length - 5)}${v.slice(-5)}`;
}

export interface DecodedVehicle {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engineDisplacement?: number;
  engineCode?: string;
  cylinderCount?: number;
  fuelType?: string;
  isHybrid?: boolean;
  drivetrain?: Drivetrain;
  bodyType?: string;
}


export type VinDecodeResult =
  | { status: "decoded"; vehicle: DecodedVehicle }
  | { status: "unavailable"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export interface VinDecoder {
  decode(vin: string): Promise<VinDecodeResult>;
}

const UNAVAILABLE =
  "We couldn't look up this VIN automatically. You can enter your vehicle details instead.";

const remoteDecoder: VinDecoder = {
  async decode(vin) {
    const check = validateVin(vin);
    if (!check.valid) return { status: "invalid", message: check.message! };

    const result = await decodeVinRemote({ data: { vin } });
    if (result.status === "decoded") return { status: "decoded", vehicle: result.vehicle };
    if (result.status === "error")
      return { status: "error", message: "VIN lookup didn't respond. You can continue manually." };
    return { status: "unavailable", message: UNAVAILABLE };
  },
};

let decoder: VinDecoder = remoteDecoder;

export function setVinDecoder(next: VinDecoder | null) {
  decoder = next ?? remoteDecoder;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  try {
    return await decoder.decode(normalizeVin(vin));
  } catch {
    return { status: "error", message: "VIN lookup didn't respond. You can continue manually." };
  }
}

/**
 * Camera-based VIN barcode scanning is not shipped yet. Returns false today;
 * when a scanner is implemented this becomes a real capability check
 * (secure context + `navigator.mediaDevices` + BarcodeDetector).
 */
export function isVinScanSupported(): boolean {
  return false;
}
