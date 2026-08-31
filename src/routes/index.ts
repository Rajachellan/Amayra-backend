import { Router } from "express";
import multer from "multer";
import { authenticateAdmin, authenticateCustomer } from "../middleware/auth.js";
import {
  adminLoginRateLimiter,
  authRateLimiter,
  authSlowDown,
  otpRateLimiter,
  otpSlowDown,
  paymentRateLimiter,
} from "../common/middleware/rateLimiters.js";
import { requirePermission } from "../common/security/rbac.js";
import { assertSafeImageUpload } from "../common/security/fileUpload.js";
import { hashPassword } from "../common/security/password.js";
import { Admin } from "../models/Admin.js";
import { wipeCatalogKeepAdmin } from "../seed/wipe.js";
import { env } from "../config/env.js";
import * as categoryController from "../controllers/categoryController.js";
import * as productController from "../controllers/productController.js";
import * as collectionController from "../controllers/collectionController.js";
import * as lookbookController from "../controllers/lookbookController.js";
import * as occasionController from "../controllers/occasionController.js";
import * as bannerController from "../controllers/bannerController.js";
import * as promotionalBannerController from "../controllers/promotionalBannerController.js";
import * as promotionLayoutController from "../modules/banner/promotion-layout.controller.js";
import * as announcementController from "../controllers/announcementController.js";
import * as homepageSettingsController from "../controllers/homepageSettingsController.js";
import * as homepageSectionController from "../controllers/homepageSectionController.js";
import * as authController from "../controllers/authController.js";
import * as blogController from "../controllers/blogController.js";
import * as leadController from "../controllers/leadController.js";
import * as dashboardController from "../controllers/dashboardController.js";
import * as customerAuthController from "../controllers/customerAuthController.js";
import * as orderCustomerController from "../controllers/orderCustomerController.js";
import * as orderAdminController from "../controllers/orderAdminController.js";
import * as shiprocketAdminController from "../controllers/shiprocketAdminController.js";
import * as paymentAdminController from "../controllers/paymentAdminController.js";
import * as savedItemsController from "../modules/customer/savedItems.controller.js";
import * as returnController from "../modules/return/return.controller.js";
import * as inventoryController from "../modules/inventory/inventory.controller.js";
import * as auditController from "../modules/audit/audit.controller.js";
import * as pricingController from "../modules/pricing/pricing.controller.js";
import * as couponController from "../modules/coupon/coupon.controller.js";
import { storeUploadedFile } from "../services/storageUpload.js";
import { AppError } from "../utils/AppError.js";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
});

export const router = Router();

router.post("/auth/login", adminLoginRateLimiter, authSlowDown, authController.login);
router.post("/api/admin/login", adminLoginRateLimiter, authSlowDown, authController.login);
router.post("/admin/login", adminLoginRateLimiter, authSlowDown, authController.login);

router.post(
  "/auth/customer/register",
  authRateLimiter,
  authSlowDown,
  customerAuthController.registerCustomer
);
router.post(
  "/auth/customer/login",
  authRateLimiter,
  authSlowDown,
  customerAuthController.loginCustomer
);
router.post(
  "/auth/customer/oauth/google",
  authRateLimiter,
  authSlowDown,
  customerAuthController.googleOAuthCustomer
);
/** Reserved for future OTP flows — limiter ready without changing API surface */
router.post("/auth/otp/request", otpRateLimiter, otpSlowDown, (_req, res) => {
  res.status(501).json({ message: "OTP not enabled" });
});
router.get("/auth/customer/me", authenticateCustomer, customerAuthController.meCustomer);
router.patch(
  "/auth/customer/me",
  authenticateCustomer,
  customerAuthController.updateCustomerProfile
);
router.post(
  "/auth/customer/me/addresses",
  authenticateCustomer,
  customerAuthController.addCustomerAddress
);
router.patch(
  "/auth/customer/me/addresses/:addressId",
  authenticateCustomer,
  customerAuthController.updateCustomerAddress
);
router.delete(
  "/auth/customer/me/addresses/:addressId",
  authenticateCustomer,
  customerAuthController.deleteCustomerAddress
);
router.post(
  "/auth/customer/me/addresses/:addressId/default",
  authenticateCustomer,
  customerAuthController.setDefaultCustomerAddress
);

router.put("/customer/saved-items/cart", authenticateCustomer, savedItemsController.syncCart);
router.put(
  "/customer/saved-items/wishlist",
  authenticateCustomer,
  savedItemsController.syncWishlist
);

router.post(
  "/orders/checkout",
  authenticateCustomer,
  paymentRateLimiter,
  orderCustomerController.postCheckout
);
router.post(
  "/payments/verify",
  authenticateCustomer,
  paymentRateLimiter,
  orderCustomerController.postVerifyPayment
);
router.get("/orders/me", authenticateCustomer, orderCustomerController.listMyOrders);
router.get(
  "/orders/:id/tracking",
  authenticateCustomer,
  orderCustomerController.getMyOrderTracking
);
router.get("/orders/:id", authenticateCustomer, orderCustomerController.getMyOrder);

router.get("/admin/dashboard", authenticateAdmin, dashboardController.getDashboardStats);

router.get("/admin/categories", authenticateAdmin, categoryController.listCategoriesAdmin);
router.get("/admin/categories/tree", authenticateAdmin, categoryController.treeCategoriesAdmin);
router.get("/admin/products", authenticateAdmin, productController.listProductsAdmin);
router.get("/admin/products/:id", authenticateAdmin, productController.getProductByIdAdmin);
router.get("/admin/collections", authenticateAdmin, collectionController.listCollectionsAdmin);
router.get("/admin/lookbooks", authenticateAdmin, lookbookController.listLookbooksAdmin);
router.get("/admin/lookbooks/:id", authenticateAdmin, lookbookController.getLookbookByIdAdmin);
router.post("/lookbooks/:id/images", authenticateAdmin, lookbookController.addLookbookImage);
router.post("/admin/lookbooks/:id/images", authenticateAdmin, lookbookController.addLookbookImage);
router.delete(
  "/lookbooks/:id/images/:imageId",
  authenticateAdmin,
  lookbookController.deleteLookbookImage
);
router.delete(
  "/admin/lookbooks/:id/images/:imageId",
  authenticateAdmin,
  lookbookController.deleteLookbookImage
);
router.put(
  "/lookbooks/:id/images/reorder",
  authenticateAdmin,
  lookbookController.reorderLookbookImages
);
router.put(
  "/admin/lookbooks/:id/images/reorder",
  authenticateAdmin,
  lookbookController.reorderLookbookImages
);
router.post("/lookbooks/:id/hotspots", authenticateAdmin, lookbookController.addLookbookHotspot);
router.post(
  "/admin/lookbooks/:id/hotspots",
  authenticateAdmin,
  lookbookController.addLookbookHotspot
);
router.put(
  "/lookbooks/:id/hotspots/:hotspotId",
  authenticateAdmin,
  lookbookController.updateLookbookHotspot
);
router.put(
  "/admin/lookbooks/:id/hotspots/:hotspotId",
  authenticateAdmin,
  lookbookController.updateLookbookHotspot
);
router.delete(
  "/lookbooks/:id/hotspots/:hotspotId",
  authenticateAdmin,
  lookbookController.deleteLookbookHotspot
);
router.delete(
  "/admin/lookbooks/:id/hotspots/:hotspotId",
  authenticateAdmin,
  lookbookController.deleteLookbookHotspot
);
router.post("/lookbooks/:id/duplicate", authenticateAdmin, lookbookController.duplicateLookbook);
router.post(
  "/admin/lookbooks/:id/duplicate",
  authenticateAdmin,
  lookbookController.duplicateLookbook
);
router.get("/admin/occasions", authenticateAdmin, occasionController.listOccasionsAdmin);

router.get("/admin/orders", authenticateAdmin, orderAdminController.listOrdersAdmin);
router.get(
  "/admin/shiprocket/pickups",
  authenticateAdmin,
  shiprocketAdminController.getShiprocketPickups
);
router.get(
  "/admin/orders/:id/shiprocket/serviceability",
  authenticateAdmin,
  shiprocketAdminController.getOrderShiprocketServiceability
);
router.post(
  "/admin/orders/:id/shiprocket/shipment",
  authenticateAdmin,
  requirePermission("orders:write"),
  shiprocketAdminController.postOrderShiprocketShipment
);
router.get("/admin/orders/:id", authenticateAdmin, orderAdminController.getOrderAdmin);
router.put(
  "/admin/orders/:id/status",
  authenticateAdmin,
  requirePermission("orders:write"),
  orderAdminController.putOrderAdminStatus
);
router.get("/admin/payments", authenticateAdmin, paymentAdminController.listPaymentsAdmin);
router.get("/admin/payments/:id", authenticateAdmin, paymentAdminController.getPaymentAdmin);

// Returns & Exchange Management API
router.get("/returns/reasons", returnController.getReasons);
router.get("/returns/eligible-orders", authenticateCustomer, returnController.getEligibleOrders);
router.get(
  "/returns/eligibility/:orderId",
  authenticateCustomer,
  returnController.getItemEligibility
);
router.post("/returns", authenticateCustomer, returnController.postCreateReturnRequest);
router.get("/returns", authenticateCustomer, returnController.getReturnList);
router.get("/returns/:id", authenticateCustomer, returnController.getReturnById);

router.get("/credits/my-credits", authenticateCustomer, returnController.getCustomerCredits);

router.get("/admin/returns", authenticateAdmin, returnController.getReturnList);
router.get("/admin/returns/:id", authenticateAdmin, returnController.getReturnById);
router.post(
  "/admin/returns/:id/approve",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postApproveReturn
);
router.post(
  "/admin/returns/:id/reject",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postRejectReturn
);
router.post(
  "/admin/returns/:id/reschedule-pickup",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postReschedulePickup
);
router.post(
  "/admin/returns/:id/receive",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postReceiveReturn
);
router.post(
  "/admin/returns/:id/qc",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postInspectReturn
);
router.post(
  "/admin/returns/:id/inspect",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postInspectReturn
);
router.post(
  "/admin/returns/:id/issue-credit",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postIssueStoreCredit
);
router.post(
  "/admin/returns/:id/issue-exchange-voucher",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postIssueExchangeVoucher
);
router.post(
  "/admin/returns/:id/create-replacement",
  authenticateAdmin,
  requirePermission("orders:write"),
  returnController.postCreateReplacementOrder
);

router.get("/admin/reasons", authenticateAdmin, returnController.getAdminReasons);
router.post(
  "/admin/reasons",
  authenticateAdmin,
  requirePermission("homepage:write"),
  returnController.createAdminReason
);
router.patch(
  "/admin/reasons/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  returnController.updateAdminReason
);

// Inventory API
router.get("/admin/inventory/ledger", authenticateAdmin, inventoryController.getInventoryLedger);
router.get(
  "/admin/inventory/stock",
  authenticateAdmin,
  inventoryController.getInventoryStockStatus
);

// Order History API
router.get("/admin/orders/:id/history", authenticateAdmin, orderAdminController.getOrderHistory);

router.get("/banners", bannerController.listBanners);
router.get("/admin/banners", authenticateAdmin, bannerController.listBannersAdmin);
router.post(
  "/banners",
  authenticateAdmin,
  requirePermission("homepage:write"),
  bannerController.createBanner
);
router.put(
  "/banners/reorder",
  authenticateAdmin,
  requirePermission("homepage:write"),
  bannerController.reorderBanners
);
router.put(
  "/banners/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  bannerController.updateBanner
);
router.delete(
  "/banners/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  bannerController.deleteBanner
);

router.get("/promotional-banners", promotionalBannerController.listPromotionalBanners);
router.get(
  "/admin/promotional-banners",
  authenticateAdmin,
  promotionalBannerController.listPromotionalBannersAdmin
);
router.post(
  "/promotional-banners",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionalBannerController.createPromotionalBanner
);
router.put(
  "/promotional-banners/reorder",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionalBannerController.reorderPromotionalBanners
);
router.post(
  "/promotional-banners/:id/duplicate",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionalBannerController.duplicatePromotionalBanner
);
router.put(
  "/promotional-banners/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionalBannerController.updatePromotionalBanner
);
router.delete(
  "/promotional-banners/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionalBannerController.deletePromotionalBanner
);

router.get("/promotion-layout", promotionLayoutController.getPromotionLayoutPublic);
router.get(
  "/admin/promotion-layout",
  authenticateAdmin,
  promotionLayoutController.getPromotionLayoutAdmin
);
router.put(
  "/admin/promotion-layout",
  authenticateAdmin,
  requirePermission("homepage:write"),
  promotionLayoutController.updatePromotionLayoutAdmin
);

// --- AUDIT LOGS ---
router.get("/admin/audit-logs", authenticateAdmin, auditController.getAuditLogsAdmin);

// --- PRICING ENGINE & SLABS ---
router.post("/cart/calculate", pricingController.calculateCart);
router.post("/cart/validate-batch", productController.validateCartBatch);
router.post("/cart/validate", productController.validateCartBatch);
router.get("/admin/pricing-settings", authenticateAdmin, pricingController.getPricingSettingsAdmin);
router.put(
  "/admin/pricing-settings",
  authenticateAdmin,
  requirePermission("homepage:write"),
  pricingController.updatePricingSettingsAdmin
);

// --- COUPONS ---
router.get("/coupons/public", couponController.listPublicCoupons);
router.get("/coupons", couponController.listPublicCoupons);
router.post("/coupons/validate", couponController.validateCoupon);
router.post("/cart/validate-coupon", couponController.validateCoupon);
router.get("/admin/coupons", authenticateAdmin, couponController.listCouponsAdmin);
router.post(
  "/admin/coupons",
  authenticateAdmin,
  requirePermission("homepage:write"),
  couponController.createCouponAdmin
);
router.put(
  "/admin/coupons/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  couponController.updateCouponAdmin
);
router.delete(
  "/admin/coupons/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  couponController.deleteCouponAdmin
);

router.get("/announcements", announcementController.listAnnouncements);
router.get(
  "/admin/announcements",
  authenticateAdmin,
  announcementController.listAnnouncementsAdmin
);
router.post(
  "/announcements",
  authenticateAdmin,
  requirePermission("homepage:write"),
  announcementController.createAnnouncement
);
router.put(
  "/announcements/reorder",
  authenticateAdmin,
  requirePermission("homepage:write"),
  announcementController.reorderAnnouncements
);
router.put(
  "/announcements/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  announcementController.updateAnnouncement
);
router.delete(
  "/announcements/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  announcementController.deleteAnnouncement
);

router.get("/homepage-settings", homepageSettingsController.getHomepageSettingsPublic);
router.get(
  "/admin/homepage-settings",
  authenticateAdmin,
  homepageSettingsController.getHomepageSettingsAdmin
);
router.put(
  "/admin/homepage-settings",
  authenticateAdmin,
  requirePermission("homepage:write"),
  homepageSettingsController.updateHomepageSettingsAdmin
);

router.get("/categories", categoryController.listCategories);
router.get("/categories/tree", categoryController.treeCategories);
router.post(
  "/categories",
  authenticateAdmin,
  requirePermission("catalog:write"),
  categoryController.createCategory
);
router.put(
  "/categories/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  categoryController.updateCategory
);
router.delete(
  "/categories/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  categoryController.deleteCategory
);

router.get("/products", productController.listProducts);
router.get("/products/:slug", productController.getProductBySlug);
router.post(
  "/products",
  authenticateAdmin,
  requirePermission("catalog:write"),
  productController.createProduct
);
router.put(
  "/products/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  productController.updateProduct
);
router.delete(
  "/products/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  productController.deleteProduct
);

router.get("/collections", collectionController.listCollections);
router.get("/collections/:slug", collectionController.getCollection);
router.post(
  "/collections",
  authenticateAdmin,
  requirePermission("catalog:write"),
  collectionController.createCollection
);
router.put(
  "/collections/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  collectionController.updateCollection
);
router.delete(
  "/collections/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  collectionController.deleteCollection
);

router.get("/lookbooks", lookbookController.listLookbooks);
router.get("/lookbooks/:slug", lookbookController.getLookbook);
router.post(
  "/lookbooks",
  authenticateAdmin,
  requirePermission("catalog:write"),
  lookbookController.createLookbook
);
router.put(
  "/lookbooks/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  lookbookController.updateLookbook
);
router.delete(
  "/lookbooks/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  lookbookController.deleteLookbook
);

router.get("/occasions", occasionController.listOccasions);
router.post(
  "/occasions",
  authenticateAdmin,
  requirePermission("catalog:write"),
  occasionController.createOccasion
);
router.put(
  "/occasions/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  occasionController.updateOccasion
);
router.delete(
  "/occasions/:id",
  authenticateAdmin,
  requirePermission("catalog:write"),
  occasionController.deleteOccasion
);

router.get("/homepage-sections", homepageSectionController.publicHomepageSections);
router.get(
  "/homepage-sections/admin",
  authenticateAdmin,
  homepageSectionController.listHomepageSectionsAdmin
);
router.post(
  "/homepage-sections",
  authenticateAdmin,
  requirePermission("homepage:write"),
  homepageSectionController.createHomepageSection
);
router.put(
  "/homepage-sections/reorder",
  authenticateAdmin,
  requirePermission("homepage:write"),
  homepageSectionController.reorderHomepageSections
);
router.put(
  "/homepage-sections/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  homepageSectionController.updateHomepageSection
);
router.delete(
  "/homepage-sections/:id",
  authenticateAdmin,
  requirePermission("homepage:write"),
  homepageSectionController.deleteHomepageSection
);

router.get("/blogs", blogController.listBlogs);
router.get("/blogs/:slug", blogController.getBlogBySlug);
router.get("/admin/blogs", authenticateAdmin, blogController.listBlogsAdmin);
router.get("/admin/blogs/:id", authenticateAdmin, blogController.getBlogByIdAdmin);
router.post(
  "/blogs",
  authenticateAdmin,
  requirePermission("blogs:write"),
  blogController.createBlog
);
router.put(
  "/blogs/:id",
  authenticateAdmin,
  requirePermission("blogs:write"),
  blogController.updateBlog
);
router.delete(
  "/blogs/:id",
  authenticateAdmin,
  requirePermission("blogs:write"),
  blogController.deleteBlog
);

router.post("/leads", leadController.submitLead);
router.get("/admin/leads", authenticateAdmin, leadController.listLeadsAdmin);
router.put("/leads/:id/status", authenticateAdmin, leadController.updateLeadStatus);
router.delete("/leads/:id", authenticateAdmin, leadController.deleteLead);

router.post(
  "/upload",
  authenticateAdmin,
  requirePermission("catalog:write"),
  memoryUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        res.status(400).json({ message: "file required" });
        return;
      }
      const safe = await assertSafeImageUpload(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      const q = req.query.folder;
      const folder =
        typeof q === "string" &&
        ["products", "categories", "banners", "blogs", "promotional", "lookbooks", "misc"].includes(
          q
        )
          ? (q as
              | "products"
              | "categories"
              | "banners"
              | "blogs"
              | "promotional"
              | "lookbooks"
              | "misc")
          : "misc";
      const result = await storeUploadedFile(req.file.buffer, `upload.${safe.ext}`, safe.mime, {
        folder,
      });
      res.json({ url: result.url, key: result.key, imageUrl: result.url, imageKey: result.key });
    } catch (e) {
      if (e instanceof AppError) return next(e);
      next(e instanceof Error ? new AppError(400, "Upload failed") : e);
    }
  }
);
router.post(
  "/admin/catalog/clear-demo",
  authenticateAdmin,
  requirePermission("catalog:write"),
  async (_req, res, next) => {
    try {
      await wipeCatalogKeepAdmin();
      res.json({ success: true, message: "Demo catalog data wiped successfully." });
    } catch (e) {
      next(e);
    }
  }
);

// Admins User Management API (super_admin only)
router.get(
  "/admin/users",
  authenticateAdmin,
  requirePermission("admin:manage"),
  async (req, res, next) => {
    try {
      const list = await Admin.find({}, { passwordHash: 0 }).sort({ createdAt: -1 });
      res.json(list);
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  "/admin/users",
  authenticateAdmin,
  requirePermission("admin:manage"),
  async (req, res, next) => {
    try {
      const { email, password, role, permissions } = req.body as {
        email?: string;
        password?: string;
        role?: string;
        permissions?: string[];
      };
      if (!email || !password) throw new AppError(400, "Email and password required");
      const existing = await Admin.findOne({ email: email.toLowerCase() });
      if (existing) throw new AppError(400, "Email already in use");
      const hash = await hashPassword(password);
      const user = await Admin.create({
        email: email.toLowerCase(),
        passwordHash: hash,
        role: role || "admin",
        permissions: permissions || [],
      });
      res.json({
        success: true,
        message: "User created",
        user: { id: user._id, email: user.email, role: user.role },
      });
    } catch (e) {
      next(e);
    }
  }
);

router.put(
  "/admin/users/:id",
  authenticateAdmin,
  requirePermission("admin:manage"),
  async (req, res, next) => {
    try {
      const { email, password, role, permissions } = req.body as {
        email?: string;
        password?: string;
        role?: string;
        permissions?: string[];
      };
      const user = await Admin.findById(req.params.id);
      if (!user) throw new AppError(404, "User not found");
      if (email) {
        const existing = await Admin.findOne({
          email: email.toLowerCase(),
          _id: { $ne: user._id },
        });
        if (existing) throw new AppError(400, "Email already in use");
        user.email = email.toLowerCase();
      }
      if (password && String(password).trim() !== "") {
        user.passwordHash = await hashPassword(password);
      }
      if (role) user.role = role as any;
      if (permissions) user.permissions = permissions;
      await user.save();
      res.json({ success: true, message: "User updated" });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  "/admin/users/:id",
  authenticateAdmin,
  requirePermission("admin:manage"),
  async (req, res, next) => {
    try {
      const user = await Admin.findById(req.params.id);
      if (!user) throw new AppError(404, "User not found");
      const callerId = (req as any).adminId;
      if (user._id.toString() === callerId) {
        throw new AppError(400, "Cannot delete your own account");
      }
      await user.deleteOne();
      res.json({ success: true, message: "User deleted" });
    } catch (e) {
      next(e);
    }
  }
);
