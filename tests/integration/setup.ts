import mongoose from "mongoose";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app/createApp.js";
import { hashPassword } from "../../src/common/security/password.js";
import { Admin } from "../../src/modules/auth/model.js";
import { Customer } from "../../src/modules/customer/model.js";
import { AuditLog } from "../../src/modules/audit/audit.model.js";

const DEFAULT_TEST_DB_URI = "mongodb://127.0.0.1:27017/amayra_integration_test";

export const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || DEFAULT_TEST_DB_URI;

/**
 * Validates that the test database URI is safe to prevent accidental operations on production data.
 */
function assertSafeTestDatabase(uri: string): void {
  const normalized = uri.toLowerCase();
  if (normalized.includes("cluster0.obqkux7.mongodb.net") && !normalized.includes("test")) {
    throw new Error(
      `FATAL SAFETY ERROR: Refusing to run tests against suspected production MongoDB: ${uri}`
    );
  }
  if (!normalized.includes("test")) {
    throw new Error(
      `FATAL SAFETY ERROR: Test database URI must explicitly contain 'test' in the database name. Got: ${uri}`
    );
  }
}

let cachedApp: Express | null = null;

export function getTestApp(): Express {
  if (!cachedApp) {
    cachedApp = createApp();
  }
  return cachedApp;
}

export function getTestClient() {
  return request(getTestApp());
}

export async function setupTestDatabase(): Promise<void> {
  assertSafeTestDatabase(TEST_MONGODB_URI);

  if (mongoose.connection.readyState === 0) {
    mongoose.set("strictQuery", true);
    await mongoose.connect(TEST_MONGODB_URI);
  }
}

export async function clearTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  await Promise.all([
    Admin.deleteMany({}),
    Customer.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
}

export async function teardownTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await clearTestDatabase();
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
  }
}

export async function createTestAdmin(data: {
  email?: string;
  password?: string;
  role?: "admin" | "super_admin" | "editor";
  permissions?: string[];
} = {}) {
  const email = (data.email ?? "testadmin@amayra.com").toLowerCase();
  const rawPassword = data.password ?? "Password123!";
  const passwordHash = await hashPassword(rawPassword);

  const admin = await Admin.create({
    email,
    passwordHash,
    role: data.role ?? "admin",
    permissions: data.permissions ?? [
      "catalog:read",
      "catalog:write",
      "orders:read",
      "orders:write",
      "payments:read",
      "shipments:write",
      "homepage:write",
      "customers:read",
      "blogs:write",
    ],
  });

  return {
    admin,
    rawPassword,
    email,
  };
}

export async function createTestCustomer(data: {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
} = {}) {
  const email = (data.email ?? "testcustomer@example.com").toLowerCase();
  const rawPassword = data.password ?? "Password123!";
  const passwordHash = await hashPassword(rawPassword);

  const customer = await Customer.create({
    name: data.name ?? "Test Customer",
    email,
    passwordHash,
    phone: data.phone ?? "9876543210",
    authProvider: "email",
  });

  return {
    customer,
    rawPassword,
    email,
  };
}
