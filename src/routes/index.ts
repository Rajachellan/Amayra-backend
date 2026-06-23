import { Router } from "express";
import multer from "multer";
import { authenticateAdmin, authenticateCustomer } from "../middleware/auth.js";
import * as categoryController from "../controllers/categoryController.js";
import * as productController from "../controllers/productController.js";
import * as collectionController from "../controllers/collectionController.js";
import * as lookbookController from "../controllers/lookbookController.js";
import * as occasionController from "../controllers/occasionController.js";
import * as bannerController from "../controllers/bannerController.js";
import * as promotionalBannerController from "../controllers/promotionalBannerController.js";
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
import { storeUploadedFile } from "../services/storageUpload.js";
import { AppError } from "../utils/AppError.js";

// Multer stores the entire upload in memory (memoryStorage), so keep this reasonable.
// If images are larger than this, Multer will throw `LIMIT_FILE_SIZE` and the upload
// will fail (which results in products having no `images[0]` -> storefront falls back).
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

export const router = Router();

router.post("/auth/login", authController.login);

router.post("/auth/customer/register", customerAuthController.registerCustomer);
router.post("/auth/customer/login", customerAuthController.loginCustomer);
router.post("/auth/customer/oauth/google", customerAuthController.googleOAuthCustomer);
router.get("/auth/customer/me", authenticateCustomer, customerAuthController.meCustomer);
router.patch("/auth/customer/me", authenticateCustomer, customerAuthController.updateCustomerProfile);

router.post("/orders/checkout", authenticateCustomer, orderCustomerController.postCheckout);
router.post("/payments/verify", authenticateCustomer, orderCustomerController.postVerifyPayment);
router.get("/orders/me", authenticateCustomer, orderCustomerController.listMyOrders);
router.get("/orders/:id/tracking", authenticateCustomer, orderCustomerController.getMyOrderTracking);
router.get("/orders/:id", authenticateCustomer, orderCustomerController.getMyOrder);

router.get("/admin/dashboard", authenticateAdmin, dashboardController.getDashboardStats);

router.get("/admin/categories", authenticateAdmin, categoryController.listCategoriesAdmin);
router.get("/admin/categories/tree", authenticateAdmin, categoryController.treeCategoriesAdmin);
router.get("/admin/products", authenticateAdmin, productController.listProductsAdmin);
router.get("/admin/products/:id", authenticateAdmin, productController.getProductByIdAdmin);
router.get("/admin/collections", authenticateAdmin, collectionController.listCollectionsAdmin);
router.get("/admin/lookbooks", authenticateAdmin, lookbookController.listLookbooksAdmin);
router.get("/admin/occasions", authenticateAdmin, occasionController.listOccasionsAdmin);

router.get("/admin/orders", authenticateAdmin, orderAdminController.listOrdersAdmin);
router.get("/admin/shiprocket/pickups", authenticateAdmin, shiprocketAdminController.getShiprocketPickups);
router.get(
  "/admin/orders/:id/shiprocket/serviceability",
  authenticateAdmin,
  shiprocketAdminController.getOrderShiprocketServiceability
);
router.post(
  "/admin/orders/:id/shiprocket/shipment",
  authenticateAdmin,
  shiprocketAdminController.postOrderShiprocketShipment
);
router.get("/admin/orders/:id", authenticateAdmin, orderAdminController.getOrderAdmin);
router.put("/admin/orders/:id/status", authenticateAdmin, orderAdminController.putOrderAdminStatus);
router.get("/admin/payments", authenticateAdmin, paymentAdminController.listPaymentsAdmin);
router.get("/admin/payments/:id", authenticateAdmin, paymentAdminController.getPaymentAdmin);

router.get("/banners", bannerController.listBanners);
router.get("/admin/banners", authenticateAdmin, bannerController.listBannersAdmin);
router.post("/banners", authenticateAdmin, bannerController.createBanner);
router.put("/banners/reorder", authenticateAdmin, bannerController.reorderBanners);
router.put("/banners/:id", authenticateAdmin, bannerController.updateBanner);
router.delete("/banners/:id", authenticateAdmin, bannerController.deleteBanner);

router.get("/promotional-banners", promotionalBannerController.listPromotionalBanners);
router.get("/admin/promotional-banners", authenticateAdmin, promotionalBannerController.listPromotionalBannersAdmin);
router.post("/promotional-banners", authenticateAdmin, promotionalBannerController.createPromotionalBanner);
router.put("/promotional-banners/reorder", authenticateAdmin, promotionalBannerController.reorderPromotionalBanners);
router.put("/promotional-banners/:id", authenticateAdmin, promotionalBannerController.updatePromotionalBanner);
router.delete("/promotional-banners/:id", authenticateAdmin, promotionalBannerController.deletePromotionalBanner);

router.get("/announcements", announcementController.listAnnouncements);
router.get("/admin/announcements", authenticateAdmin, announcementController.listAnnouncementsAdmin);
router.post("/announcements", authenticateAdmin, announcementController.createAnnouncement);
router.put("/announcements/reorder", authenticateAdmin, announcementController.reorderAnnouncements);
router.put("/announcements/:id", authenticateAdmin, announcementController.updateAnnouncement);
router.delete("/announcements/:id", authenticateAdmin, announcementController.deleteAnnouncement);

router.get("/homepage-settings", homepageSettingsController.getHomepageSettingsPublic);
router.get("/admin/homepage-settings", authenticateAdmin, homepageSettingsController.getHomepageSettingsAdmin);
router.put("/admin/homepage-settings", authenticateAdmin, homepageSettingsController.updateHomepageSettingsAdmin);

router.get("/categories", categoryController.listCategories);
router.get("/categories/tree", categoryController.treeCategories);
router.post("/categories", authenticateAdmin, categoryController.createCategory);
router.put("/categories/:id", authenticateAdmin, categoryController.updateCategory);
router.delete("/categories/:id", authenticateAdmin, categoryController.deleteCategory);

router.get("/products", productController.listProducts);
router.get("/products/:slug", productController.getProductBySlug);
router.post("/products", authenticateAdmin, productController.createProduct);
router.put("/products/:id", authenticateAdmin, productController.updateProduct);
router.delete("/products/:id", authenticateAdmin, productController.deleteProduct);

router.get("/collections", collectionController.listCollections);
router.get("/collections/:slug", collectionController.getCollection);
router.post("/collections", authenticateAdmin, collectionController.createCollection);
router.put("/collections/:id", authenticateAdmin, collectionController.updateCollection);
router.delete("/collections/:id", authenticateAdmin, collectionController.deleteCollection);

router.get("/lookbooks", lookbookController.listLookbooks);
router.get("/lookbooks/:slug", lookbookController.getLookbook);
router.post("/lookbooks", authenticateAdmin, lookbookController.createLookbook);
router.put("/lookbooks/:id", authenticateAdmin, lookbookController.updateLookbook);
router.delete("/lookbooks/:id", authenticateAdmin, lookbookController.deleteLookbook);

router.get("/occasions", occasionController.listOccasions);
router.post("/occasions", authenticateAdmin, occasionController.createOccasion);
router.put("/occasions/:id", authenticateAdmin, occasionController.updateOccasion);
router.delete("/occasions/:id", authenticateAdmin, occasionController.deleteOccasion);

router.get("/homepage-sections", homepageSectionController.publicHomepageSections);
router.get("/homepage-sections/admin", authenticateAdmin, homepageSectionController.listHomepageSectionsAdmin);
router.post("/homepage-sections", authenticateAdmin, homepageSectionController.createHomepageSection);
router.put("/homepage-sections/reorder", authenticateAdmin, homepageSectionController.reorderHomepageSections);
router.put("/homepage-sections/:id", authenticateAdmin, homepageSectionController.updateHomepageSection);
router.delete("/homepage-sections/:id", authenticateAdmin, homepageSectionController.deleteHomepageSection);

router.get("/blogs", blogController.listBlogs);
router.get("/blogs/:slug", blogController.getBlogBySlug);
router.get("/admin/blogs", authenticateAdmin, blogController.listBlogsAdmin);
router.get("/admin/blogs/:id", authenticateAdmin, blogController.getBlogByIdAdmin);
router.post("/blogs", authenticateAdmin, blogController.createBlog);
router.put("/blogs/:id", authenticateAdmin, blogController.updateBlog);
router.delete("/blogs/:id", authenticateAdmin, blogController.deleteBlog);

router.post("/leads", leadController.submitLead);
router.get("/admin/leads", authenticateAdmin, leadController.listLeadsAdmin);
router.put("/leads/:id/status", authenticateAdmin, leadController.updateLeadStatus);
router.delete("/leads/:id", authenticateAdmin, leadController.deleteLead);

router.post("/upload", authenticateAdmin, memoryUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ message: "file required" });
      return;
    }
    const q = req.query.folder;
    const folder =
      typeof q === "string" &&
      ["products", "categories", "banners", "blogs", "promotional", "misc"].includes(q)
        ? (q as "products" | "categories" | "banners" | "blogs" | "promotional" | "misc")
        : "misc";
    const result = await storeUploadedFile(req.file.buffer, req.file.originalname, req.file.mimetype, {
      folder,
    });
    res.json({ url: result.url, key: result.key, imageUrl: result.url, imageKey: result.key });
  } catch (e) {
    next(e instanceof Error ? new AppError(500, e.message) : e);
  }
});
