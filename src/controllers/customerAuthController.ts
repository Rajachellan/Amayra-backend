import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { Customer } from "../models/Customer.js";
import { AppError } from "../utils/AppError.js";

function signCustomerToken(customerId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, "JWT_SECRET not configured");
  return jwt.sign({ sub: customerId, role: "customer" }, secret, { expiresIn: "30d" });
}

export async function registerCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = body.password ?? "";
    if (!name || !email || password.length < 6) {
      throw new AppError(400, "Name, email, and password (min 6 chars) required");
    }
    if (await Customer.findOne({ email })) throw new AppError(409, "Email already registered");
    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await Customer.create({
      name,
      email,
      passwordHash,
      phone: body.phone ? String(body.phone).trim() : undefined,
      authProvider: "email",
    });
    const token = signCustomerToken(customer._id.toString());
    res.status(201).json({
      token,
      customer: { id: customer._id, name: customer.name, email: customer.email },
    });
  } catch (e) {
    next(e);
  }
}

export async function loginCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new AppError(400, "Email and password required");
    const customer = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (!customer) throw new AppError(401, "Invalid credentials");
    if (!customer.passwordHash) {
      throw new AppError(
        401,
        "This account uses Google sign-in. Please continue with Google or reset password when available."
      );
    }
    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) throw new AppError(401, "Invalid credentials");
    const token = signCustomerToken(customer._id.toString());
    res.json({
      token,
      customer: { id: customer._id, name: customer.name, email: customer.email, avatarUrl: customer.avatarUrl },
    });
  } catch (e) {
    next(e);
  }
}

export async function googleOAuthCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) throw new AppError(400, "idToken required");
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
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
    const name =
      payload.name?.trim() ||
      (email.includes("@") ? email.split("@")[0] : "Customer");
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
      customer: { id: customer._id, name: customer.name, email: customer.email, avatarUrl: customer.avatarUrl },
    });
  } catch (e) {
    next(e instanceof AppError ? e : new AppError(401, "Google authentication failed"));
  }
}

export async function meCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");
    const customer = await Customer.findById(customerId).lean();
    if (!customer) throw new AppError(404, "Customer not found");
    res.json({
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      addresses: customer.addresses,
    });
  } catch (e) {
    next(e);
  }
}

export async function updateCustomerProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");
    const body = req.body as { name?: string; phone?: string; addresses?: unknown };
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.phone !== undefined) update.phone = String(body.phone).trim();
    if (body.addresses !== undefined) update.addresses = body.addresses;
    const customer = await Customer.findByIdAndUpdate(customerId, update, {
      new: true,
      runValidators: true,
    }).lean();
    if (!customer) throw new AppError(404, "Customer not found");
    res.json({
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      addresses: customer.addresses,
    });
  } catch (e) {
    next(e);
  }
}
