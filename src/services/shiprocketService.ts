import { AppError } from "../utils/AppError.js";
import { getShiprocketBearerToken, getShiprocketBaseUrl, invalidateShiprocketToken } from "./shiprocketAuth.js";

async function srFetch(path: string, init: RequestInit & { retriesWithFreshToken?: boolean } = {}): Promise<unknown> {
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
    const { retriesWithFreshToken: _drop, ...retryInit } = init;
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
  const data = await srFetch("/v1/external/settings/company/addpickup", { method: "GET" }) as Record<
    string,
    unknown
  >;

  if (typeof data.success === "boolean" && data.success === false) {
    srThrow(data, "Shiprocket pickups request failed");
  }

  let raw: unknown[] = [];
  if (Array.isArray(data.data)) raw = data.data as unknown[];
  else if (
    typeof data.data === "object" &&
    data.data !== null &&
    Array.isArray((data.data as { shipping_address?: unknown[] }).shipping_address)
  ) {
    raw = (data.data as { shipping_address: unknown[] }).shipping_address;
  }

  const out: NormalizedPickup[] = [];
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
    if (nickname && pin) out.push({
      nickname: nickname.trim(),
      pinCode: pin.trim(),
      city: typeof o.city === "string" ? o.city : undefined,
      phone: typeof o.phone === "string" ? o.phone : typeof o.phone === "number" ? String(o.phone) : undefined,
    });
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

export async function createAdhocOrder(payload: AdhocOrderPayload): Promise<Record<string, unknown>> {
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

export async function assignAwb(shipmentId: number | string, courierId: number): Promise<Record<string, unknown>> {
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
