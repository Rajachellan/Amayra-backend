import type { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { env } from "../../config/env.js";
import { signAccessToken } from "../../common/auth/tokens.js";
import { hashPassword, verifyPassword } from "../../common/security/password.js";
import { Customer, serializeAddress } from "./model.js";
import { AppError } from "../../utils/AppError.js";
import {
  addressSchema,
  emailSchema,
  formatZodError,
  personNameSchema,
  phoneSchema,
  updateProfileSchema,
} from "./validation.js";

function signCustomerToken(customerId: string): string {
  return signAccessToken(customerId, "customer").token;
}

function customerIdFrom(req: Request): string {
  const id = (req as Request & { customerId?: string }).customerId;
  if (!id) throw new AppError(401, "Unauthorized");
  return id;
}

function profilePayload(customer: {
  _id: { toString(): string };
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  addresses?: unknown[];
}) {
  const addresses = Array.isArray(customer.addresses)
    ? customer.addresses.map((a) => serializeAddress(a as Parameters<typeof serializeAddress>[0]))
    : [];
  return {
    id: customer._id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone ?? "",
    avatarUrl: customer.avatarUrl,
    addresses,
  };
}

function ensureSingleDefault(addresses: Array<{ isDefault?: boolean }>, forceIndex?: number): void {
  if (!addresses.length) return;
  if (typeof forceIndex === "number" && forceIndex >= 0 && forceIndex < addresses.length) {
    addresses.forEach((a, i) => {
      a.isDefault = i === forceIndex;
    });
    return;
  }
  const defaults = addresses.filter((a) => a.isDefault);
  if (defaults.length === 0) {
    addresses[0].isDefault = true;
  } else if (defaults.length > 1) {
    let kept = false;
    for (const a of addresses) {
      if (a.isDefault && !kept) {
        kept = true;
      } else {
        a.isDefault = false;
      }
    }
  }
}

export async function registerCustomer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };
    const name = personNameSchema.parse(String(body.name ?? ""));
    const email = emailSchema.parse(String(body.email ?? ""));
    const password = body.password ?? "";
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new AppError(
        400,
        "Password must be at least 8 characters and include a letter and a number"
      );
    }
    let phone: string | undefined;
    if (body.phone) {
      phone = phoneSchema.parse(String(body.phone));
    }
    if (await Customer.findOne({ email })) throw new AppError(409, "Email already registered");
    const passwordHash = await hashPassword(password);
    const customer = await Customer.create({
      name,
      email,
      passwordHash,
      phone,
      authProvider: "email",
    });
    const token = signCustomerToken(customer._id.toString());
    res.status(201).json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return next(new AppError(400, formatZodError(e)));
    next(e);
  }
}

export async function loginCustomer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new AppError(400, "Email and password required");
    const normalizedEmail = emailSchema.parse(String(email));
    const customer = await Customer.findOne({ email: normalizedEmail });
    if (!customer) throw new AppError(401, "Invalid credentials");
    if (!customer.passwordHash) {
      throw new AppError(
        401,
        "This account uses Google sign-in. Please continue with Google or reset password when available."
      );
    }
    const ok = await verifyPassword(password, customer.passwordHash);
    if (!ok) throw new AppError(401, "Invalid credentials");
    const token = signCustomerToken(customer._id.toString());
    res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        avatarUrl: customer.avatarUrl,
        phone: customer.phone,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return next(new AppError(400, formatZodError(e)));
    next(e);
  }
}

export async function googleOAuthCustomer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) throw new AppError(400, "idToken required");
    const googleClientId = env.GOOGLE_CLIENT_ID;
    if (!googleClientId) throw new AppError(500, "GOOGLE_CLIENT_ID not configured");

    const client = new OAuth2Client(googleClientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new AppError(401, "Invalid Google token");
    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const name = payload.name?.trim() || (email.includes("@") ? email.split("@")[0] : "Customer");
    const avatarUrl = payload.picture;

    let customer = await Customer.findOne({ $or: [{ googleId }, { email }] });
    if (customer) {
      if (!customer.googleId) customer.googleId = googleId;
      customer.authProvider = "google";
      if (avatarUrl) customer.avatarUrl = avatarUrl;
      if (customer.name === "Guest" || !customer.name) customer.name = name;
      await customer.save();
    } else {
      customer = await Customer.create({
        name,
        email,
        googleId,
        authProvider: "google",
        avatarUrl,
      });
    }

    const token = signCustomerToken(customer._id.toString());
    res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        avatarUrl: customer.avatarUrl,
        phone: customer.phone,
      },
    });
  } catch (e) {
    next(e instanceof AppError ? e : new AppError(401, "Google authentication failed"));
  }
}

export async function meCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const customer = await Customer.findById(customerId).lean();
    if (!customer) throw new AppError(404, "Customer not found");
    res.json(profilePayload(customer));
  } catch (e) {
    next(e);
  }
}

export async function updateCustomerProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const parsed = updateProfileSchema.parse(req.body ?? {});
    const update: Record<string, unknown> = {};
    if (parsed.name !== undefined) update.name = parsed.name;
    if (parsed.phone !== undefined) update.phone = parsed.phone;

    const customer = await Customer.findByIdAndUpdate(customerId, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!customer) throw new AppError(404, "Customer not found");
    res.json(profilePayload(customer));
  } catch (e) {
    if (e instanceof z.ZodError) return next(new AppError(400, formatZodError(e)));
    next(e);
  }
}

export async function addCustomerAddress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const parsed = addressSchema.parse(req.body ?? {});
    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError(404, "Customer not found");

    if (customer.addresses.length >= 8) {
      throw new AppError(400, "You can save up to 8 addresses");
    }

    if (parsed.isDefault || customer.addresses.length === 0) {
      for (const a of customer.addresses) {
        a.isDefault = false;
      }
    }

    customer.addresses.push({
      ...parsed,
      isDefault: parsed.isDefault || customer.addresses.length === 0,
    } as never);
    ensureSingleDefault(customer.addresses as Array<{ isDefault?: boolean }>);
    await customer.save();

    res.status(201).json(profilePayload(customer.toObject()));
  } catch (e) {
    if (e instanceof z.ZodError) return next(new AppError(400, formatZodError(e)));
    next(e);
  }
}

export async function updateCustomerAddress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const addressId = String(req.params.addressId ?? "");
    if (!addressId) throw new AppError(400, "Address id required");
    const parsed = addressSchema.parse(req.body ?? {});

    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError(404, "Customer not found");

    const addr = customer.addresses.id(addressId);
    if (!addr) throw new AppError(404, "Address not found");

    addr.label = parsed.label;
    addr.fullName = parsed.fullName;
    addr.phone = parsed.phone;
    addr.line1 = parsed.line1;
    addr.line2 = parsed.line2;
    addr.city = parsed.city;
    addr.state = parsed.state;
    addr.pincode = parsed.pincode;
    addr.country = parsed.country;

    if (parsed.isDefault) {
      for (const a of customer.addresses) {
        a.isDefault = String(a._id) === addressId;
      }
    } else {
      ensureSingleDefault(customer.addresses as Array<{ isDefault?: boolean }>);
    }

    await customer.save();
    res.json(profilePayload(customer.toObject()));
  } catch (e) {
    if (e instanceof z.ZodError) return next(new AppError(400, formatZodError(e)));
    next(e);
  }
}

export async function deleteCustomerAddress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const addressId = String(req.params.addressId ?? "");
    if (!addressId) throw new AppError(400, "Address id required");

    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError(404, "Customer not found");

    const addr = customer.addresses.id(addressId);
    if (!addr) throw new AppError(404, "Address not found");
    addr.deleteOne();

    ensureSingleDefault(customer.addresses as Array<{ isDefault?: boolean }>);
    await customer.save();
    res.json(profilePayload(customer.toObject()));
  } catch (e) {
    next(e);
  }
}

export async function setDefaultCustomerAddress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = customerIdFrom(req);
    const addressId = String(req.params.addressId ?? "");
    if (!addressId) throw new AppError(400, "Address id required");

    const customer = await Customer.findById(customerId);
    if (!customer) throw new AppError(404, "Customer not found");

    const idx = customer.addresses.findIndex((a) => String(a._id) === addressId);
    if (idx < 0) throw new AppError(404, "Address not found");

    ensureSingleDefault(customer.addresses as Array<{ isDefault?: boolean }>, idx);
    await customer.save();
    res.json(profilePayload(customer.toObject()));
  } catch (e) {
    next(e);
  }
}
