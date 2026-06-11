import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "@hermes-os/shared";

const execFileAsync = promisify(execFile);

export type RidePayload = {
  /** Destination address or "lat,lng". Required. */
  dropoff?: string;
  /** Optional pickup address; defaults to current location. */
  pickup?: string;
  /** Optional nickname for the dropoff shown in the app. */
  dropoffNickname?: string;
};

/** Parse "lat,lng" if the caller passed coordinates instead of an address. */
function parseLatLng(value: string): { lat: string; lng: string } | null {
  const m = value.trim().match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  return m ? { lat: m[1]!, lng: m[2]! } : null;
}

async function openUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", [url], { timeout: 10_000 });
  }
}

/**
 * There is no consumer ride-hailing API, so we hand off via official deep links
 * with pickup + destination prefilled. The user taps "Confirm" in the app —
 * which is the right safety boundary for spending money on a ride anyway.
 */
export async function executeRideUber(payload: unknown): Promise<ToolResult> {
  const body = (payload ?? {}) as RidePayload;
  const dropoff = body.dropoff?.trim();
  if (!dropoff) return { status: "denied", reason: "dropoff (destination) is required" };

  const params = new URLSearchParams({ action: "setPickup" });
  const pickupCoords = body.pickup ? parseLatLng(body.pickup) : null;
  if (pickupCoords) {
    params.set("pickup[latitude]", pickupCoords.lat);
    params.set("pickup[longitude]", pickupCoords.lng);
  } else if (body.pickup?.trim()) {
    params.set("pickup[formatted_address]", body.pickup.trim());
  } else {
    params.set("pickup", "my_location");
  }

  const dropCoords = parseLatLng(dropoff);
  if (dropCoords) {
    params.set("dropoff[latitude]", dropCoords.lat);
    params.set("dropoff[longitude]", dropCoords.lng);
  } else {
    params.set("dropoff[formatted_address]", dropoff);
  }
  if (body.dropoffNickname) params.set("dropoff[nickname]", body.dropoffNickname);

  const url = `https://m.uber.com/ul/?${params.toString()}`;
  try {
    await openUrl(url);
  } catch {
    /* still return the link so the user/agent can use it */
  }
  return {
    status: "success",
    data: {
      provider: "uber",
      url,
      opened: process.platform === "darwin",
      note: "Opened Uber with pickup + destination prefilled. Confirm the ride in the app.",
    },
  };
}

export async function executeRideLyft(payload: unknown): Promise<ToolResult> {
  const body = (payload ?? {}) as RidePayload;
  const dropoff = body.dropoff?.trim();
  if (!dropoff) return { status: "denied", reason: "dropoff (destination) is required" };

  const params = new URLSearchParams({ id: "lyft" });
  const dropCoords = parseLatLng(dropoff);
  if (dropCoords) {
    params.set("destination[latitude]", dropCoords.lat);
    params.set("destination[longitude]", dropCoords.lng);
  } else {
    params.set("destination[address]", dropoff);
  }
  const pickupCoords = body.pickup ? parseLatLng(body.pickup) : null;
  if (pickupCoords) {
    params.set("pickup[latitude]", pickupCoords.lat);
    params.set("pickup[longitude]", pickupCoords.lng);
  } else if (body.pickup?.trim()) {
    params.set("pickup[address]", body.pickup.trim());
  }

  const url = `https://ride.lyft.com/ridetype?${params.toString()}`;
  try {
    await openUrl(url);
  } catch {
    /* still return the link */
  }
  return {
    status: "success",
    data: {
      provider: "lyft",
      url,
      opened: process.platform === "darwin",
      note: "Opened Lyft with destination prefilled. Confirm the ride in the app.",
    },
  };
}
