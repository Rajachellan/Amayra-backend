import fs from "fs";
import path from "path";

const root = path.resolve("src");

const shims = {
  "models/Customer.ts": 'export * from "../modules/customer/model.js";\n',
  "models/Admin.ts": 'export * from "../modules/auth/model.js";\n',
  "models/Product.ts": 'export * from "../modules/product/model.js";\n',
  "models/Category.ts": 'export * from "../modules/category/model.js";\n',
  "models/Collection.ts": 'export * from "../modules/collection/model.js";\n',
  "models/Occasion.ts": 'export * from "../modules/occasion/model.js";\n',
  "models/Lookbook.ts": 'export * from "../modules/lookbook/model.js";\n',
  "models/Order.ts": 'export * from "../modules/order/model.js";\n',
  "models/Payment.ts": 'export * from "../modules/payment/model.js";\n',
  "models/Banner.ts": 'export * from "../modules/banner/model.js";\n',
  "models/PromotionalBanner.ts": 'export * from "../modules/banner/promotional.model.js";\n',
  "models/Announcement.ts": 'export * from "../modules/homepage/announcement.model.js";\n',
  "models/HomepageSettings.ts": 'export * from "../modules/homepage/settings.model.js";\n',
  "models/HomepageSection.ts": 'export * from "../modules/homepage/section.model.js";\n',
  "models/Blog.ts": 'export * from "../modules/blog/model.js";\n',
  "models/Lead.ts": 'export * from "../modules/lead/model.js";\n',
  "validation/customerProfile.ts": 'export * from "../modules/customer/validation.js";\n',
  "services/razorpayService.ts": 'export * from "../integrations/razorpay/service.js";\n',
  "services/shiprocketService.ts": 'export * from "../integrations/shiprocket/service.js";\n',
  "services/shiprocketAuth.ts": 'export * from "../integrations/shiprocket/auth.js";\n',
  "services/storageUpload.ts": 'export * from "../integrations/cloudflare/upload.service.js";\n',
  "services/checkoutService.ts": 'export * from "../modules/checkout/service.js";\n',
  "services/categoryService.ts": 'export * from "../modules/category/service.js";\n',
  "services/occasionService.ts": 'export * from "../modules/occasion/service.js";\n',
  "controllers/customerAuthController.ts": 'export * from "../modules/customer/controller.js";\n',
  "controllers/authController.ts": 'export * from "../modules/auth/controller.js";\n',
  "controllers/productController.ts": 'export * from "../modules/product/controller.js";\n',
  "controllers/categoryController.ts": 'export * from "../modules/category/controller.js";\n',
  "controllers/collectionController.ts": 'export * from "../modules/collection/controller.js";\n',
  "controllers/occasionController.ts": 'export * from "../modules/occasion/controller.js";\n',
  "controllers/lookbookController.ts": 'export * from "../modules/lookbook/controller.js";\n',
  "controllers/orderCustomerController.ts": 'export * from "../modules/order/customer.controller.js";\n',
  "controllers/orderAdminController.ts": 'export * from "../modules/order/admin.controller.js";\n',
  "controllers/paymentAdminController.ts": 'export * from "../modules/payment/admin.controller.js";\n',
  "controllers/razorpayWebhookController.ts": 'export * from "../modules/payment/webhook.controller.js";\n',
  "controllers/shiprocketAdminController.ts": 'export * from "../modules/shipment/controller.js";\n',
  "controllers/bannerController.ts": 'export * from "../modules/banner/controller.js";\n',
  "controllers/promotionalBannerController.ts": 'export * from "../modules/banner/promotional.controller.js";\n',
  "controllers/announcementController.ts": 'export * from "../modules/homepage/announcement.controller.js";\n',
  "controllers/homepageSettingsController.ts": 'export * from "../modules/homepage/settings.controller.js";\n',
  "controllers/homepageSectionController.ts": 'export * from "../modules/homepage/section.controller.js";\n',
  "controllers/blogController.ts": 'export * from "../modules/blog/controller.js";\n',
  "controllers/leadController.ts": 'export * from "../modules/lead/controller.js";\n',
  "controllers/dashboardController.ts": 'export * from "../modules/dashboard/controller.js";\n',
};

for (const [rel, content] of Object.entries(shims)) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log("shim", rel);
}
