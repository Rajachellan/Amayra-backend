import { Router } from "express";
import multer from "multer";
import { authenticateAdmin } from "../middleware/auth.js";
import * as categoryController from "../controllers/categoryController.js";
import * as productController from "../controllers/productController.js";
import * as collectionController from "../controllers/collectionController.js";
import * as lookbookController from "../controllers/lookbookController.js";
import * as occasionController from "../controllers/occasionController.js";
import * as bannerController from "../controllers/bannerController.js";
import * as homepageSectionController from "../controllers/homepageSectionController.js";
import * as authController from "../controllers/authController.js";
import * as blogController from "../controllers/blogController.js";
import * as leadController from "../controllers/leadController.js";
import * as dashboardController from "../controllers/dashboardController.js";
import { storeUploadedFile } from "../services/storageUpload.js";
import { AppError } from "../utils/AppError.js";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const router = Router();

router.post("/auth/login", authController.login);

router.get("/admin/dashboard", authenticateAdmin, dashboardController.getDashboardStats);

router.get("/admin/categories", authenticateAdmin, categoryController.listCategoriesAdmin);
router.get("/admin/categories/tree", authenticateAdmin, categoryController.treeCategoriesAdmin);
router.get("/admin/products", authenticateAdmin, productController.listProductsAdmin);
router.get("/admin/products/:id", authenticateAdmin, productController.getProductByIdAdmin);
router.get("/admin/collections", authenticateAdmin, collectionController.listCollectionsAdmin);
router.get("/admin/lookbooks", authenticateAdmin, lookbookController.listLookbooksAdmin);
router.get("/admin/occasions", authenticateAdmin, occasionController.listOccasionsAdmin);

router.get("/banners", bannerController.listBanners);
router.post("/banners", authenticateAdmin, bannerController.createBanner);
router.put("/banners/:id", authenticateAdmin, bannerController.updateBanner);
router.delete("/banners/:id", authenticateAdmin, bannerController.deleteBanner);

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
      typeof q === "string" && ["products", "categories", "banners", "blogs", "misc"].includes(q)
        ? (q as "products" | "categories" | "banners" | "blogs" | "misc")
        : "misc";
    const url = await storeUploadedFile(req.file.buffer, req.file.originalname, req.file.mimetype, {
      folder,
    });
    res.json({ url });
  } catch (e) {
    next(e instanceof Error ? new AppError(500, e.message) : e);
  }
});
