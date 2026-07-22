# Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| auth | `modules/auth` | Admin login / bootstrap admin model |
| customer | `modules/customer` | Customer auth, profile, addresses |
| product | `modules/product` | Catalogue products |
| category | `modules/category` | Category tree |
| collection | `modules/collection` | Collections |
| occasion | `modules/occasion` | Occasions |
| lookbook | `modules/lookbook` | Lookbooks |
| order | `modules/order` | Customer + admin orders |
| checkout | `modules/checkout` | Checkout draft / pricing |
| payment | `modules/payment` | Payments + Razorpay webhook |
| shipment | `modules/shipment` | Shiprocket admin fulfilment |
| banner | `modules/banner` | Hero + promotional banners |
| homepage | `modules/homepage` | Settings, sections, announcements |
| blog | `modules/blog` | Blog CMS |
| lead | `modules/lead` | Lead capture |
| dashboard | `modules/dashboard` | Admin dashboard stats |
| media | via `integrations/cloudflare` | Uploads to R2 |

## Integrations

| Integration | Path |
|-------------|------|
| Razorpay | `integrations/razorpay` |
| Shiprocket | `integrations/shiprocket` |
| Cloudflare R2 | `integrations/cloudflare` |
