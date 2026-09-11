import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setupTestDatabase,
  teardownTestDatabase,
  clearTestDatabase,
  getTestClient,
  createTestAdmin,
  createTestCustomer,
} from "../setup.js";
import { Admin } from "../../../src/modules/auth/model.js";
import { Customer } from "../../../src/modules/customer/model.js";

describe("Integration: Authentication Flow", () => {
  const client = getTestClient();

  before(async () => {
    await setupTestDatabase();
  });

  after(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe("POST /auth/login (Admin Login)", () => {
    it("1. should successfully login with valid credentials and return tokens and admin info", async () => {
      const { email, rawPassword } = await createTestAdmin({
        email: "superadmin@amayra.com",
        password: "AdminPassword123!",
        role: "admin",
      });

      const res = await client
        .post("/auth/login")
        .send({
          email,
          password: rawPassword,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, "Login successful");
      assert.ok(typeof res.body.token === "string" && res.body.token.length > 20);
      assert.ok(typeof res.body.refreshToken === "string" && res.body.refreshToken.length > 20);
      assert.ok(res.body.admin);
      assert.equal(res.body.admin.email, email);
      assert.equal(res.body.admin.role, "admin");
      assert.ok(Array.isArray(res.body.admin.permissions));
      assert.ok(res.body.admin.permissions.includes("catalog:read"));
    });

    it("2. should return 400 when email is missing", async () => {
      const res = await client
        .post("/auth/login")
        .send({
          password: "SomePassword123!",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "email and password required");
    });

    it("3. should return 400 when password is missing", async () => {
      const res = await client
        .post("/auth/login")
        .send({
          email: "admin@amayra.com",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.message, "email and password required");
    });

    it("4. should return 401 and no token when password is invalid", async () => {
      const { email } = await createTestAdmin({
        email: "admin-wrongpass@amayra.com",
        password: "CorrectPassword123!",
      });

      const res = await client
        .post("/auth/login")
        .send({
          email,
          password: "WrongPassword999!",
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Invalid credentials");
      assert.equal(res.body.token, undefined);
    });

    it("5. should return 401 when admin does not exist", async () => {
      const res = await client
        .post("/auth/login")
        .send({
          email: "nonexistent@amayra.com",
          password: "SomePassword123!",
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Invalid credentials");
      assert.equal(res.body.token, undefined);
    });

    it("6. should normalize email and allow login with uppercase / mixed-case email", async () => {
      const { rawPassword } = await createTestAdmin({
        email: "case.sensitive@amayra.com",
        password: "AdminPassword123!",
      });

      const res = await client
        .post("/auth/login")
        .send({
          email: "CASE.Sensitive@Amayra.COM",
          password: rawPassword,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.admin.email, "case.sensitive@amayra.com");
      assert.ok(res.body.token);
    });

    it("7. should also be accessible via /api/auth/login and /admin/login alias routes", async () => {
      const { email, rawPassword } = await createTestAdmin({
        email: "aliases@amayra.com",
        password: "Password123!",
      });

      const resApi = await client
        .post("/api/auth/login")
        .send({ email, password: rawPassword });
      assert.equal(resApi.status, 200);

      const resAdmin = await client
        .post("/admin/login")
        .send({ email, password: rawPassword });
      assert.equal(resAdmin.status, 200);
    });
  });

  describe("Authentication & Authorization Middleware Behavior", () => {
    it("8. should allow access to protected admin route with valid Bearer token", async () => {
      const { email, rawPassword } = await createTestAdmin({
        email: "protected-test@amayra.com",
        password: "Password123!",
      });

      const loginRes = await client
        .post("/auth/login")
        .send({ email, password: rawPassword });

      assert.equal(loginRes.status, 200);
      const token = loginRes.body.token;

      // Access protected admin route
      const dashboardRes = await client
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      assert.equal(dashboardRes.status, 200);
    });

    it("9. should reject access to protected route when Authorization header is missing", async () => {
      const res = await client.get("/admin/dashboard");
      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Unauthorized");
    });

    it("10. should reject access to protected route when token is invalid or tampered", async () => {
      const res = await client
        .get("/admin/dashboard")
        .set("Authorization", "Bearer invalid.token.string");

      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Invalid token");
    });
  });

  describe("Customer Authentication Flow (Register, Login, Profile)", () => {
    it("11. should register a new customer successfully", async () => {
      const payload = {
        name: "Aarav Sharma",
        email: "aarav.sharma@example.com",
        password: "CustomerPass123",
        phone: "9876543210",
      };

      const res = await client
        .post("/auth/customer/register")
        .send(payload);

      assert.equal(res.status, 201);
      assert.ok(res.body.token);
      assert.equal(res.body.customer.name, "Aarav Sharma");
      assert.equal(res.body.customer.email, "aarav.sharma@example.com");

      // Verify customer was created in the test database
      const dbCustomer = await Customer.findOne({ email: "aarav.sharma@example.com" });
      assert.ok(dbCustomer);
      assert.equal(dbCustomer.name, "Aarav Sharma");
    });

    it("12. should reject customer registration when email already exists", async () => {
      await createTestCustomer({
        email: "duplicate@example.com",
      });

      const res = await client
        .post("/auth/customer/register")
        .send({
          name: "Another Person",
          email: "duplicate@example.com",
          password: "CustomerPass123",
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.message, "Email already registered");
    });

    it("13. should login registered customer and provide profile via /auth/customer/me", async () => {
      const { email, rawPassword } = await createTestCustomer({
        email: "login.customer@example.com",
        password: "CustomerPass123",
        name: "Customer User",
      });

      // Login
      const loginRes = await client
        .post("/auth/customer/login")
        .send({
          email,
          password: rawPassword,
        });

      assert.equal(loginRes.status, 200);
      assert.ok(loginRes.body.token);
      assert.equal(loginRes.body.customer.email, email);

      const customerToken = loginRes.body.token;

      // Access customer profile
      const meRes = await client
        .get("/auth/customer/me")
        .set("Authorization", `Bearer ${customerToken}`);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.email, email);
      assert.equal(meRes.body.name, "Customer User");
    });

    it("14. should reject customer token attempting to access admin route (role isolation)", async () => {
      const { email, rawPassword } = await createTestCustomer({
        email: "isolation.check@example.com",
        password: "CustomerPass123",
      });

      const loginRes = await client
        .post("/auth/customer/login")
        .send({ email, password: rawPassword });

      const customerToken = loginRes.body.token;

      // Try to hit admin dashboard
      const res = await client
        .get("/admin/dashboard")
        .set("Authorization", `Bearer ${customerToken}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.message, "Unauthorized");
    });
  });
});
