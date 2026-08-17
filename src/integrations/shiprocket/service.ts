import { AppError } from "../../utils/AppError.js";
import {
  getShiprocketBearerToken,
  getShiprocketBaseUrl,
  invalidateShiprocketToken,
} from "./auth.js";

async function srFetch(
  path: string,
  init: RequestInit & { retriesWithFreshToken?: boolean } = {}
): Promise<unknown> {
  const base = getShiprocketBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const { retriesWithFreshToken, ...restInit } = init;
  const token = await getShiprocketBearerToken();
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    ...(typeof restInit.body === "string" ? { "Content-Type": "application/json" } : {}),
    ...(restInit.headers ?? {}),
  };

  const res = await fetch(url, {
    ...restInit,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !retriesWithFreshToken) {
    invalidateShiprocketToken();
    await getShiprocketBearerToken(true);
    const retryInit = { ...init };
    delete retryInit.retriesWithFreshToken;
    return srFetch(path, { ...retryInit, retriesWithFreshToken: true });
  }
  return data;
}

function srThrow(data: unknown, fallback: string) {
  const d = data as Record<string, unknown>;
  const msg =
    (typeof d.message === "string" && d.message) ||
    (Array.isArray(d.errors) ? JSON.stringify(d.errors) : "") ||
    (typeof d.errors === "object" && d.errors !== null ? JSON.stringify(d.errors) : "") ||
    fallback;
  throw new AppError(502, msg);
}

export type NormalizedPickup = {
  nickname: string;
  pinCode: string;
  city?: string;
  phone?: string;
};

/** Normalize various Shiprocket pickup list payload shapes */
export async function listPickupLocations(): Promise<NormalizedPickup[]> {
  const data = (await srFetch("/v1/external/settings/company/pickup", { method: "GET" })) as Record<
    string,
    unknown
  >;

  if (typeof data.status_code === "number" && data.status_code >= 400) {
    srThrow(data, "Shiprocket pickups request failed");
  }
  if (typeof data.success === "boolean" && data.success === false) {
    srThrow(data, "Shiprocket pickups request failed");
  }

  let raw: unknown[] = [];
  const payload = data.data;
  if (Array.isArray(payload)) {
    raw = payload;
  } else if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.recent_addresses) && p.recent_addresses.length > 0) {
      raw = p.recent_addresses;
    } else if (Array.isArray(p.shipping_address)) {
      raw = p.shipping_address;
    } else if (p.shipping_address && typeof p.shipping_address === "object") {
      raw = [p.shipping_address];
    }
  }

  const out: NormalizedPickup[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const nickname =
      (typeof o.pickup_location === "string" && o.pickup_location) ||
      (typeof o.nickname === "string" && o.nickname) ||
      (typeof o.title === "string" && o.title) ||
      "";
    const pin =
      (typeof o.pin_code === "string" && o.pin_code) ||
      (typeof o.pin_code === "number" ? String(o.pin_code) : "") ||
      (typeof o.pincode === "string" && o.pincode) ||
      "";
    if (nickname && pin) {
      const key = nickname.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        nickname: nickname.trim(),
        pinCode: pin.trim(),
        city: typeof o.city === "string" ? o.city : undefined,
        phone:
          typeof o.phone === "string"
            ? o.phone
            : typeof o.phone === "number"
              ? String(o.phone)
              : undefined,
      });
    }
  }
  return out;
}

export async function courierServiceability(args: {
  pickupPostcode: string;
  deliveryPostcode: string;
  weightKg: number;
  cod: boolean;
}) {
  const pc = encodeURIComponent(args.pickupPostcode.replace(/\s/g, ""));
  const dc = encodeURIComponent(args.deliveryPostcode.replace(/\s/g, ""));
  const w = encodeURIComponent(String(args.weightKg));
  const cod = args.cod ? 1 : 0;
  const path = `/v1/external/courier/serviceability/?pickup_postcode=${pc}&delivery_postcode=${dc}&weight=${w}&cod=${cod}`;

  const data = (await srFetch(path, { method: "GET" })) as Record<string, unknown>;
  if (typeof data.success === "boolean" && data.success === false) {
    srThrow(data, "Shiprocket serviceability failed");
  }
  return data;
}

export type AdhocOrderPayload = Record<string, unknown>;

export async function createAdhocOrder(
  payload: AdhocOrderPayload
): Promise<Record<string, unknown>> {
  const data = (await srFetch("/v1/external/orders/create/adhoc", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as Record<string, unknown>;

  const errs = data.errors ?? data.errors_message;
  if (errs !== undefined && errs !== null && String(errs).length > 1) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof errs === "string"
          ? errs
          : JSON.stringify(errs);
    throw new AppError(502, msg);
  }
  if (typeof data.status_code === "number" && data.status_code >= 400) {
    srThrow(data, "Shiprocket create order failed");
  }
  return data;
}

export async function assignAwb(
  shipmentId: number | string,
  courierId: number
): Promise<Record<string, unknown>> {
  const data = (await srFetch("/v1/external/courier/assign/awb", {
    method: "POST",
    body: JSON.stringify({
      shipment_id: typeof shipmentId === "string" ? Number(shipmentId) : shipmentId,
      courier_id: courierId,
    }),
  })) as Record<string, unknown>;

  if (typeof data.awb_assign_error === "string" && data.awb_assign_error) {
    throw new AppError(400, data.awb_assign_error);
  }
  if (typeof data.success === "boolean" && data.success === false && !data.response) {
    srThrow(data, "Shiprocket AWB assignment failed");
  }
  return data;
}

/** Best-effort extract shipment id from create/adhoc response */
export function extractShipmentIdFromCreateResponse(data: Record<string, unknown>): string | null {
  const payload = data.payload as Record<string, unknown> | undefined;
  const candidates = [
    data.shipment_id,
    payload?.shipment_id,
    data.shipmentId,
    (data.order_shipment_id as string | number | undefined)?.toString(),
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  const orderId = data.order_id ?? payload?.order_id;
  if (orderId !== undefined && orderId !== null) {
    // Some responses nest shipments
    const nested = data.shipments as unknown;
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      const sid = (nested[0] as { id?: number }).id;
      if (typeof sid === "number") return String(sid);
    }
  }
  return null;
}

export function extractSrOrderIdFromCreateResponse(data: Record<string, unknown>): string | null {
  const payload = data.payload as Record<string, unknown> | undefined;
  const v = data.order_id ?? payload?.order_id;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export type PublicTrackingActivity = {
  date: string;
  status: string;
  activity: string;
  location?: string;
};

export type PublicTrackingInfo = {
  awbCode: string;
  currentStatus?: string;
  courierName?: string;
  expectedDelivery?: string;
  trackingUrl?: string;
  activities: PublicTrackingActivity[];
  message?: string;
};

export function normalizeTrackingResponse(data: unknown, awbCode: string): PublicTrackingInfo {
  const root = data as Record<string, unknown>;
  const td = (root.tracking_data ?? root.data ?? root) as Record<string, unknown>;
  const track = Array.isArray(td.shipment_track)
    ? (td.shipment_track[0] as Record<string, unknown>)
    : undefined;
  const activitiesRaw = Array.isArray(td.shipment_track_activities)
    ? td.shipment_track_activities
    : [];

  const activities: PublicTrackingActivity[] = activitiesRaw
    .filter((a) => a && typeof a === "object")
    .map((a) => {
      const row = a as Record<string, unknown>;
      return {
        date: typeof row.date === "string" ? row.date : "",
        status: typeof row.status === "string" ? row.status : "",
        activity: typeof row.activity === "string" ? row.activity : "",
        location: typeof row.location === "string" ? row.location : undefined,
      };
    })
    .filter((a) => a.activity || a.status);

  const currentStatus =
    (typeof track?.current_status === "string" && track.current_status) ||
    activities[0]?.activity ||
    undefined;

  const edd =
    (typeof track?.edd === "string" && track.edd) ||
    (typeof td.etd === "string" && td.etd) ||
    (typeof td.edd === "string" && td.edd) ||
    undefined;

  const trackingUrl =
    (typeof td.track_url === "string" && td.track_url) ||
    `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}`;

  const err = td.error;
  const message = typeof err === "string" && err ? err : undefined;

  return {
    awbCode,
    currentStatus,
    courierName: typeof track?.courier_name === "string" ? track.courier_name : undefined,
    expectedDelivery: edd,
    trackingUrl,
    activities,
    message,
  };
}

export async function trackByAwb(awbCode: string): Promise<PublicTrackingInfo> {
  const awb = awbCode.trim();
  if (!awb) throw new AppError(400, "AWB code required");
  const data = await srFetch(`/v1/external/courier/track/awb/${encodeURIComponent(awb)}`, {
    method: "GET",
  });
  return normalizeTrackingResponse(data, awb);
}

export async function createReturnOrder(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const data = (await srFetch("/v1/external/orders/create/return", {
    method: "POST",
    body: JSON.stringify(payload),
  })) as Record<string, unknown>;

  const errs = data.errors ?? data.errors_message;
  if (errs !== undefined && errs !== null && String(errs).length > 1) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof errs === "string"
          ? errs
          : JSON.stringify(errs);
    throw new AppError(502, msg);
  }
  if (typeof data.status_code === "number" && data.status_code >= 400) {
    srThrow(data, "Shiprocket create return order failed");
  }
  return data;
}

export async function cancelOrder(srOrderId: string | number): Promise<Record<string, unknown>> {
  const data = (await srFetch("/v1/external/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ ids: [typeof srOrderId === "string" ? Number(srOrderId) : srOrderId] }),
  })) as Record<string, unknown>;

  if (typeof data.status_code === "number" && data.status_code >= 400) {
    srThrow(data, "Shiprocket cancel order failed");
  }
  return data;
}
