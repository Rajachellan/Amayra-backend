import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { Admin } from "../models/Admin.js";
import { Category } from "../models/Category.js";
import { Collection } from "../models/Collection.js";
import { Occasion } from "../models/Occasion.js";
import { Lookbook } from "../models/Lookbook.js";
import { Banner } from "../models/Banner.js";
import { Product } from "../models/Product.js";
import { HomepageSection } from "../models/HomepageSection.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/amayra";

async function run() {
  await connectDb(mongoUri);
  await Promise.all([
    Admin.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    Order.deleteMany({}),
    Category.deleteMany({}),
    Collection.deleteMany({}),
    Occasion.deleteMany({}),
    Lookbook.deleteMany({}),
    Banner.deleteMany({}),
    Product.deleteMany({}),
    HomepageSection.deleteMany({}),
  ]);

  const adminPass = process.env.ADMIN_PASSWORD || "changeme";
  await Admin.create({
    email: (process.env.ADMIN_EMAIL || "admin@amayra.local").toLowerCase(),
    passwordHash: await bcrypt.hash(adminPass, 10),
    role: "admin",
  });

  const jewellery = await Category.create({
    name: "Jewellery",
    slug: "jewellery",
    description: "Fine jewellery",
    image: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1200&auto=format&fit=crop",
    featured: true,
    showOnHomepage: true,
    order: 0,
    active: true,
  });

  const subSpecs = [
    { name: "Earrings", slug: "earrings", order: 1 },
    { name: "Necklaces", slug: "necklaces", order: 2 },
    { name: "Bangles", slug: "bangles", order: 3 },
    { name: "Rings", slug: "rings", order: 4 },
    { name: "Bridal", slug: "bridal", order: 5 },
  ];

  const subs = await Category.insertMany(
    subSpecs.map((s) => ({
      ...s,
      parentCategory: jewellery._id,
      featured: true,
      showOnHomepage: true,
      active: true,
      image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=800&auto=format&fit=crop",
    }))
  );

  const earrings = subs.find((c) => c.slug === "earrings")!;
  const necklaces = subs.find((c) => c.slug === "necklaces")!;
  const bangles = subs.find((c) => c.slug === "bangles")!;
  const rings = subs.find((c) => c.slug === "rings")!;
  const bridalCat = subs.find((c) => c.slug === "bridal")!;

  const colHeritage = await Collection.create({
    name: "Heritage Series",
    slug: "heritage-series",
    description: "Temple and kundan artistry",
    image: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=1200&auto=format&fit=crop",
    featured: true,
    order: 0,
    active: true,
  });

  const colModern = await Collection.create({
    name: "Modern Minimal",
    slug: "modern-minimal",
    description: "Clean lines for everyday luxury",
    image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1200&auto=format&fit=crop",
    featured: true,
    order: 1,
    active: true,
  });

  await Occasion.insertMany([
    {
      name: "Wedding",
      slug: "wedding",
      description: "Bridal moments",
      image: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?q=80&w=800&auto=format&fit=crop",
      order: 0,
      active: true,
    },
    {
      name: "Festival",
      slug: "festival",
      order: 1,
      active: true,
    },
  ]);

  const wedding = await Occasion.findOne({ slug: "wedding" });

  const lb = await Lookbook.create({
    title: "Shop The Look — Royal Bridal",
    slug: "royal-bridal",
    description: "Complete the ensemble",
    coverImage: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=1200&auto=format&fit=crop",
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1200&auto=format&fit=crop",
    ],
    featured: true,
    order: 0,
    active: true,
  });

  await Banner.insertMany([
    {
      title: "Elegance Redefined",
      subtitle: "Discover curated masterpieces designed for those who appreciate heritage artistry.",
      image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?q=80&w=2000&auto=format&fit=crop",
      link: "/category/all",
      ctaLabel: "Explore Collection",
      order: 0,
      active: true,
    },
    {
      title: "The Bridal Edit",
      subtitle: "Unveiling timeless treasures crafted for your most unforgettable moments.",
      image: "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?q=80&w=2000&auto=format&fit=crop",
      link: "/category/bridal",
      ctaLabel: "Discover Bridal",
      order: 1,
      active: true,
    },
    {
      title: "Heritage Brilliance",
      subtitle: "Artisanal excellence passed down through generations of master craftsmen.",
      image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=2000&auto=format&fit=crop",
      link: "/about",
      ctaLabel: "Our Story",
      order: 2,
      active: true,
    },
  ]);

  const p1 = await Product.create({
    name: "Classic Diamond Solitaire Ring",
    slug: "classic-diamond-solitaire-ring",
    shortDescription: "Brilliant-cut solitaire in 18k gold.",
    description:
      "A stunning 18k yellow gold ring featuring a brilliant-cut solitaire diamond. Perfect for engagements and special moments.",
    category: rings._id,
    subCategory: rings._id,
    collections: [colModern._id],
    occasions: wedding ? [wedding._id] : [],
    lookbooks: [lb._id],
    sections: ["atelier"],
    images: [
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=1200&auto=format&fit=crop",
    ],
    price: 105000,
    salePrice: 85000,
    stock: 12,
    sku: "RING-SOL-001",
    tags: ["solitaire", "bridal"],
    material: "18k Yellow Gold",
    color: "Gold",
    weight: "4.5g",
    featured: true,
    trending: true,
    masterpiece: true,
    soldCount: 120,
    trendingScore: 98,
    seoTitle: "Classic Diamond Solitaire Ring",
    seoDescription: "Luxury solitaire ring in 18k gold.",
    status: "published",
    variants: [
      { name: "Size 6", sku: "RING-SOL-001-6", stock: 4, attributes: { size: "6" } },
      { name: "Size 7", sku: "RING-SOL-001-7", stock: 8, attributes: { size: "7" } },
    ],
  });

  const p2 = await Product.create({
    name: "Emerald & Diamond Princess Necklace",
    slug: "emerald-diamond-princess-necklace",
    shortDescription: "Regal emerald with diamond halo.",
    description:
      "A regal emerald necklace surrounded by a halo of pear-shaped diamonds. A masterpiece for the modern bride.",
    category: necklaces._id,
    collections: [colHeritage._id],
    occasions: wedding ? [wedding._id] : [],
    lookbooks: [lb._id],
    sections: ["atelier"],
    images: [
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1200&auto=format&fit=crop",
    ],
    price: 285000,
    salePrice: 245000,
    stock: 3,
    sku: "NEC-EM-001",
    material: "Platinum",
    color: "Emerald",
    weight: "25g",
    featured: true,
    trending: true,
    soldCount: 45,
    trendingScore: 92,
    status: "published",
  });

  const p3 = await Product.create({
    name: "Pure Gold Temple Bangle",
    slug: "pure-gold-temple-bangle",
    shortDescription: "Handcrafted 22k temple motifs.",
    description: "Handcrafted 22k pure gold bangle with intricate carvings of traditional Indian motifs.",
    category: bangles._id,
    collections: [colHeritage._id],
    sections: ["signature"],
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1200&auto=format&fit=crop",
    ],
    price: 135000,
    salePrice: 120000,
    stock: 8,
    sku: "BAN-TM-001",
    material: "22k Pure Gold",
    color: "Gold",
    weight: "18g",
    featured: true,
    soldCount: 89,
    trendingScore: 88,
    status: "published",
  });

  const p4 = await Product.create({
    name: "Rose Gold Floral Earrings",
    slug: "rose-gold-floral-earrings",
    shortDescription: "Delicate floral studs in rose gold.",
    description: "Delicate floral studs crafted in 18k rose gold with diamond accents.",
    category: earrings._id,
    collections: [colModern._id],
    sections: ["atelier"],
    images: [
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=1200&auto=format&fit=crop",
    ],
    price: 35000,
    stock: 20,
    sku: "EAR-FL-001",
    material: "18k Rose Gold",
    color: "Rose Gold",
    soldCount: 210,
    trendingScore: 95,
    trending: true,
    status: "published",
  });

  await Product.insertMany([
    {
      name: "Kundan Statement Rani Haar",
      slug: "kundan-statement-rani-haar",
      shortDescription: "Opulent Kundan bridal necklace.",
      description:
        "An opulent multi-string Kundan and emerald necklace, perfect for a royal bridal ensemble.",
      category: necklaces._id,
      subCategory: necklaces._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1615655406736-b37c4fabf923?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 420000,
      salePrice: 350000,
      stock: 2,
      material: "22k Gold & Kundan",
      color: "Gold",
      weight: "120g",
      status: "published",
    },
    {
      name: "Victorian Sapphire Earrings",
      slug: "victorian-sapphire-earrings",
      shortDescription: "Sapphire drops in Victorian style.",
      description: "Deep blue sapphire drops surrounded by micro-diamonds in a Victorian style.",
      category: earrings._id,
      subCategory: earrings._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1630019017578-831633534d02?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 85000,
      salePrice: 68000,
      stock: 12,
      material: "18k Rose Gold",
      color: "Blue",
      weight: "5.8g",
      status: "published",
    },
    {
      name: "Heritage South Indian Hasli",
      slug: "heritage-south-indian-hasli",
      shortDescription: "Traditional gold Hasli choker.",
      description: "Traditional stiff choker necklace with rubies and hand-etched gold work.",
      category: necklaces._id,
      subCategory: necklaces._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1626784215021-2e39ccf971cd?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 185000,
      stock: 4,
      material: "22k Gold",
      color: "Gold",
      weight: "55g",
      status: "published",
    },
    {
      name: "Antique Peacock Brooch",
      slug: "antique-peacock-brooch",
      shortDescription: "Gold peacock motif brooch.",
      description:
        "A masterfully crafted gold brooch featuring a peacock motif with enamel work and pearls.",
      category: necklaces._id,
      subCategory: necklaces._id,
      collections: [colModern._id],
      images: [
        "https://images.unsplash.com/photo-1617038220319-276d3cfab638?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 42000,
      stock: 10,
      material: "18k Gold",
      color: "Multi",
      weight: "12g",
      status: "published",
    },
    {
      name: "Ruby Temple Jhumkas",
      slug: "ruby-temple-jhumkas",
      shortDescription: "Temple ruby jhumkas.",
      description: "Traditional temple earrings with rubies and gold bells.",
      category: earrings._id,
      subCategory: earrings._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1598560912005-597659b7524b?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 55000,
      stock: 15,
      material: "22k Gold",
      color: "Ruby",
      weight: "14g",
      status: "published",
    },
    {
      name: "Minimalist Gold Leaf Brooch",
      slug: "minimalist-gold-leaf-brooch",
      shortDescription: "Modern matte gold leaf brooch.",
      description: "A subtle leaf design in matte finish gold for formal occasions.",
      category: earrings._id,
      subCategory: earrings._id,
      collections: [colModern._id],
      images: [
        "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 18000,
      stock: 25,
      material: "14k Gold",
      color: "Gold",
      weight: "4g",
      status: "published",
    },
    {
      name: "Bridal Emerald Mathapatti",
      slug: "bridal-emerald-mathapatti",
      shortDescription: "Emerald bridal headpiece.",
      description: "A stunning bridal headpiece with gold work and teardrop emeralds.",
      category: bridalCat._id,
      subCategory: bridalCat._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1620914107106-25ed75f10f88?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 125000,
      stock: 5,
      material: "22k Gold",
      color: "Emerald",
      weight: "45g",
      status: "published",
    },
    {
      name: "American Diamond Hoop Earrings",
      slug: "american-diamond-hoop-earrings",
      shortDescription: "CZ hoops in sterling silver.",
      description: "High-quality cubic zirconia set in sterling silver hoops.",
      category: earrings._id,
      subCategory: earrings._id,
      collections: [colModern._id],
      images: [
        "https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 15000,
      salePrice: 12000,
      stock: 50,
      material: "925 Silver",
      color: "Silver",
      weight: "3.5g",
      status: "published",
    },
    {
      name: "Heritage Kundan Necklace Set",
      slug: "heritage-kundan-necklace-set",
      shortDescription: "Complete Kundan bridal set.",
      description: "Heavy Kundan necklace set with matching earrings and maang tikka.",
      category: necklaces._id,
      subCategory: necklaces._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1615655406736-b37c4fabf923?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 245000,
      stock: 3,
      material: "24k Gold Foil",
      color: "Green",
      weight: "180g",
      status: "published",
    },
    {
      name: "Victorian Sapphire Choker",
      slug: "victorian-sapphire-choker",
      shortDescription: "Sapphire Victorian choker.",
      description: "Victorian-style choker with sapphires and rose cut diamonds.",
      category: necklaces._id,
      subCategory: necklaces._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1626784215021-2e39ccf971cd?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 125000,
      salePrice: 95000,
      stock: 7,
      material: "18k Rose Gold",
      color: "Blue",
      weight: "28g",
      status: "published",
    },
    {
      name: "South Indian Temple Belt (Oddiyanam)",
      slug: "south-indian-temple-belt-oddiyanam",
      shortDescription: "Bridal gold waist belt.",
      description:
        "Royal South Indian bridal waist belt with Lakshmi motifs and handcrafted finish.",
      category: bridalCat._id,
      subCategory: bridalCat._id,
      collections: [colHeritage._id],
      images: [
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 450000,
      stock: 1,
      material: "22k Gold",
      color: "Gold",
      weight: "250g",
      status: "published",
    },
    {
      name: "Daily Wear Gold Studs",
      slug: "daily-wear-gold-studs",
      shortDescription: "Lightweight 18k gold studs.",
      description: "Simple elegant gold studs for daily wear.",
      category: earrings._id,
      subCategory: earrings._id,
      collections: [colModern._id],
      images: [
        "https://images.unsplash.com/photo-1635767798638-3e2827e84a2b?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 15000,
      stock: 100,
      material: "18k Gold",
      color: "Gold",
      weight: "2.1g",
      status: "published",
    },
    {
      name: "Victorian Diamond Bracelet",
      slug: "victorian-diamond-bracelet",
      shortDescription: "Vintage-style diamond bracelet.",
      description: "Vintage-inspired bracelet with black rhodium finish and grey diamonds.",
      category: bangles._id,
      subCategory: bangles._id,
      collections: [colModern._id],
      images: [
        "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1200&auto=format&fit=crop",
      ],
      price: 75000,
      stock: 15,
      material: "Sterling Silver",
      color: "Silver",
      weight: "15g",
      status: "published",
    },
  ]);

  await Lookbook.findByIdAndUpdate(lb._id, { products: [p1._id, p2._id, p3._id] });

  await HomepageSection.insertMany([
    {
      sectionType: "featured-categories",
      title: "Shop By Category",
      order: 0,
      active: true,
      referenceType: "None",
      referenceIds: [],
    },
    {
      sectionType: "featured-collections",
      title: "Signature Collections",
      order: 1,
      active: true,
      referenceType: "Collection",
      referenceIds: [colHeritage._id, colModern._id],
    },
    {
      sectionType: "atelier-products",
      title: "Jewel Atelier",
      order: 2,
      active: true,
      referenceType: "None",
      referenceIds: [],
    },
  ]);

  console.log("Seed complete.");
  console.log("Admin:", process.env.ADMIN_EMAIL || "admin@amayra.local", "/", adminPass);
  console.log("Sample product slugs:", p1.slug, p2.slug);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
