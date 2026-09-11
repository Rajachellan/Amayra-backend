import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Admin } from "../../../src/modules/auth/model.js";

describe("Auth Model - Admin Schema Validation", () => {
  it("should validate a valid admin document", async () => {
    const admin = new Admin({
      email: "admin@example.com",
      passwordHash: "hashedPassword123",
      role: "admin",
      permissions: ["catalog:read"],
    });

    const error = admin.validateSync();
    assert.equal(error, undefined);
    assert.equal(admin.email, "admin@example.com");
    assert.equal(admin.role, "admin");
    assert.deepEqual(admin.permissions, ["catalog:read"]);
  });

  it("should fail validation when email is missing", () => {
    const admin = new Admin({
      passwordHash: "hashedPassword123",
    });

    const error = admin.validateSync();
    assert.ok(error);
    assert.ok(error.errors.email);
  });

  it("should fail validation when passwordHash is missing", () => {
    const admin = new Admin({
      email: "admin@example.com",
    });

    const error = admin.validateSync();
    assert.ok(error);
    assert.ok(error.errors.passwordHash);
  });

  it("should automatically convert email to lowercase", () => {
    const admin = new Admin({
      email: "UPPERCASE.ADMIN@DOMAIN.COM",
      passwordHash: "hashedPassword123",
    });

    assert.equal(admin.email, "uppercase.admin@domain.com");
  });

  it("should default role to 'admin' and permissions to empty array", () => {
    const admin = new Admin({
      email: "newadmin@example.com",
      passwordHash: "hashedPassword123",
    });

    assert.equal(admin.role, "admin");
    assert.deepEqual(admin.permissions, []);
  });

  it("should fail validation when role is not in enum", () => {
    const admin = new Admin({
      email: "admin@example.com",
      passwordHash: "hashedPassword123",
      role: "invalid_role",
    });

    const error = admin.validateSync();
    assert.ok(error);
    assert.ok(error.errors.role);
  });

  it("should accept valid roles: editor and super_admin", () => {
    const editor = new Admin({
      email: "editor@example.com",
      passwordHash: "hashedPassword123",
      role: "editor",
    });
    const superAdmin = new Admin({
      email: "super@example.com",
      passwordHash: "hashedPassword123",
      role: "super_admin",
    });

    assert.equal(editor.validateSync(), undefined);
    assert.equal(editor.role, "editor");
    assert.equal(superAdmin.validateSync(), undefined);
    assert.equal(superAdmin.role, "super_admin");
  });
});
