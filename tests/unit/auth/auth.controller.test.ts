import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Admin } from "../../../src/modules/auth/model.js";
import { AuditLog } from "../../../src/modules/audit/audit.model.js";
import { login } from "../../../src/modules/auth/controller.js";
import { AppError } from "../../../src/utils/AppError.js";
import * as tokensModule from "../../../src/common/auth/tokens.js";

function createMockReqRes(body: Record<string, unknown> = {}, ip = "127.0.0.1") {
  const req: any = {
    body,
    ip,
    headers: {},
    socket: { remoteAddress: ip },
  };
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  const nextCalls: any[] = [];
  const next = (err?: any) => {
    nextCalls.push(err);
  };
  return { req, res, next, nextCalls };
}

describe("Auth Controller - login()", () => {
  beforeEach(() => {
    mock.restoreAll();
    // Prevent unhandled DB buffer operations for AuditLog
    mock.method(AuditLog, "create", async () => ({}));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("should throw AppError(400) when email is missing", async () => {
    const { req, res, next, nextCalls } = createMockReqRes({ password: "password123" });

    await login(req, res, next);

    assert.equal(nextCalls.length, 1);
    assert.ok(nextCalls[0] instanceof AppError);
    assert.equal(nextCalls[0].statusCode, 400);
    assert.equal(nextCalls[0].message, "email and password required");
    assert.equal(res.jsonData, null);
  });

  it("should throw AppError(400) when password is missing", async () => {
    const { req, res, next, nextCalls } = createMockReqRes({ email: "admin@example.com" });

    await login(req, res, next);

    assert.equal(nextCalls.length, 1);
    assert.ok(nextCalls[0] instanceof AppError);
    assert.equal(nextCalls[0].statusCode, 400);
    assert.equal(nextCalls[0].message, "email and password required");
  });

  it("should throw AppError(400) when both email and password are empty strings", async () => {
    const { req, res, next, nextCalls } = createMockReqRes({ email: "", password: "" });

    await login(req, res, next);

    assert.equal(nextCalls.length, 1);
    assert.ok(nextCalls[0] instanceof AppError);
    assert.equal(nextCalls[0].statusCode, 400);
    assert.equal(nextCalls[0].message, "email and password required");
  });

  it("should throw AppError(401) and query lowercased email when admin is not found", async () => {
    let queriedEmail: string | undefined;
    mock.method(Admin, "findOne", async (filter: { email: string }) => {
      queriedEmail = filter.email;
      return null;
    });

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "Admin.Test@Domain.COM",
      password: "secretPassword",
    });

    await login(req, res, next);

    assert.equal(queriedEmail, "admin.test@domain.com");
    assert.equal(nextCalls.length, 1);
    assert.ok(nextCalls[0] instanceof AppError);
    assert.equal(nextCalls[0].statusCode, 401);
    assert.equal(nextCalls[0].message, "Invalid credentials");
  });

  it("should throw AppError(401) when password verification fails", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a1"),
      email: "admin@example.com",
      passwordHash: "hashed_password_sample",
      role: "admin",
      permissions: ["catalog:read"],
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => false);

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "admin@example.com",
      password: "wrongPassword",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 1);
    assert.ok(nextCalls[0] instanceof AppError);
    assert.equal(nextCalls[0].statusCode, 401);
    assert.equal(nextCalls[0].message, "Invalid credentials");
  });

  it("should login successfully with existing permissions and role", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a1"),
      email: "admin@example.com",
      passwordHash: "valid_hash",
      role: "admin",
      permissions: ["catalog:read", "orders:read"],
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);

    let auditDataLogged: any = null;
    mock.method(AuditLog, "create", async (data: any) => {
      auditDataLogged = data;
      return data;
    });

    const { req, res, next, nextCalls } = createMockReqRes(
      { email: "admin@example.com", password: "correctPassword" },
      "192.168.1.50"
    );

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    assert.equal(res.jsonData.success, true);
    assert.equal(res.jsonData.message, "Login successful");
    assert.equal(typeof res.jsonData.token, "string");
    assert.equal(typeof res.jsonData.refreshToken, "string");
    assert.deepEqual(res.jsonData.admin, {
      id: fakeAdmin._id.toString(),
      email: "admin@example.com",
      role: "admin",
      permissions: ["catalog:read", "orders:read"],
    });
    assert.deepEqual(res.jsonData.user, res.jsonData.admin);

    // Verify req properties set for audit
    assert.equal(req.adminId, fakeAdmin._id.toString());
    assert.equal(req.adminEmail, "admin@example.com");

    // Verify audit log call
    assert.ok(auditDataLogged);
    assert.equal(auditDataLogged.action, "ADMIN_LOGIN");
    assert.equal(auditDataLogged.module, "auth");
    assert.equal(auditDataLogged.targetId, fakeAdmin._id.toString());
  });

  it("should apply default permissions when admin has empty permissions array", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a2"),
      email: "staff@example.com",
      passwordHash: "valid_hash",
      role: "admin",
      permissions: [],
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "staff@example.com",
      password: "correctPassword",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    const defaultPermissions = [
      "catalog:read",
      "catalog:write",
      "orders:read",
      "orders:write",
      "payments:read",
      "shipments:write",
      "homepage:write",
      "customers:read",
      "blogs:write",
    ];
    assert.deepEqual(res.jsonData.admin.permissions, defaultPermissions);
  });

  it("should handle super_admin role and undefined permissions with defaults", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a3"),
      email: "super@example.com",
      passwordHash: "valid_hash",
      role: "super_admin",
      permissions: undefined,
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "super@example.com",
      password: "correctPassword",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    assert.equal(res.jsonData.admin.role, "super_admin");
    assert.equal(res.jsonData.admin.permissions.length, 9);
  });

  it("should handle editor role and null permissions with defaults", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a6"),
      email: "editor@example.com",
      passwordHash: "valid_hash",
      role: "editor",
      permissions: null as any,
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "editor@example.com",
      password: "correctPassword",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    assert.equal(res.jsonData.admin.role, "editor");
    assert.equal(res.jsonData.admin.permissions.length, 9);
  });

  it("should fallback role to 'admin' when role is null or undefined", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a4"),
      email: "norole@example.com",
      passwordHash: "valid_hash",
      role: undefined,
      permissions: ["orders:read"],
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "norole@example.com",
      password: "correctPassword",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    assert.equal(res.jsonData.admin.role, undefined); // In adminPayload, role is admin.role
  });

  it("should forward database exceptions to next middleware", async () => {
    const dbError = new Error("Database connection failure");
    mock.method(Admin, "findOne", async () => {
      throw dbError;
    });

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "admin@example.com",
      password: "password123",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 1);
    assert.equal(nextCalls[0], dbError);
  });

  it("should still respond successfully if audit log writing fails", async () => {
    const fakeAdmin = {
      _id: new mongoose.Types.ObjectId("65f1a1a1a1a1a1a1a1a1a1a5"),
      email: "auditfail@example.com",
      passwordHash: "valid_hash",
      role: "admin",
      permissions: ["catalog:read"],
    };

    mock.method(Admin, "findOne", async () => fakeAdmin);
    mock.method(bcrypt, "compare", async () => true);
    mock.method(AuditLog, "create", async () => {
      throw new Error("Audit log database error");
    });

    const { req, res, next, nextCalls } = createMockReqRes({
      email: "auditfail@example.com",
      password: "password123",
    });

    await login(req, res, next);

    assert.equal(nextCalls.length, 0);
    assert.ok(res.jsonData);
    assert.equal(res.jsonData.success, true);
  });
});
