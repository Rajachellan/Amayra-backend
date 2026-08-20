import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/amayra";

async function run() {
  await connectDb(mongoUri);
  console.log("Connected to MongoDB.");

  let category = await Category.findOne({ slug: "earrings" });
  if (!category) {
    let parentCat = await Category.findOne({ slug: "jewellery" });
    if (!parentCat) {
      parentCat = await Category.create({
        name: "Jewellery",
        slug: "jewellery",
        active: true,
        featured: true,
        order: 0,
      });
    }
    category = await Category.create({
      name: "Earrings",
      slug: "earrings",
      parentCategory: parentCat._id,
      active: true,
      featured: true,
      order: 1,
    });
  }

  const slug = "hand-crafted-moissanite-polki-studded-earcuff";

  const productData = {
    name: "Hand Crafted Moissanite Polki Studded Earcuff",
    slug,
    shortDescription: "Effortless elegance, every time you wear it.",
    description:
      "Hello, fashionistas! Ready to make heads turn with the perfect showstopper earrings? Whether you're dressing up for a party or keeping it chic for everyday wear, Ishhaara's earrings for women are crafted to bring out your inner diva.\n\nFrom classy party wear earrings, stone earrings, and western earrings to oxidised earrings and daily wear earrings, Ishhaara's glamorous wardrobe holds something for everyone. Are you ready to become the talk of the town with Ishhaara's exclusively curated trendy earrings?\n\nDon't hold back! Check out Ishhaara's artificial earring standout features and find your perfect style today!",
    category: category._id,
    price: 9900,
    salePrice: 6500,
    stock: 50,
    sku: "RM-DD1921",
    material: "Skin Friendly | Hypoallergenic",
    length: "7.5 cm",
    breadth: "3.8 cm",
    height: "1.2 cm",
    specifications: {
      material: "Skin Friendly | Hypoallergenic",
      craftsmanship: "Ethically Handmade",
      waterproof: "Retains Colour and Brilliance",
    },
    keyHighlights: [
      "Exquisite Craftsmanship: Ishhaara's pair of artificial earrings whether it be crystal earrings, ear cuff earrings or small earrings is crafted with attention to detail, offering premium quality and a flawless finish.",
      "Hypoallergenic Materials: Ishhaara’s artificial earrings whether it be stud earrings, hoops, dangles, Chandbali earrings or Jhumkas are crafted with skin-friendly materials, making these pieces a wonderful choice for sensitive skin.",
      "Attention-Grabbing Designs: Coming in bold and eye-catching styles, Ishhaara's trendy earrings whether it be earrings for saree or traditional earrings, our artificial earrings designs are perfect for making a statement wherever you go.",
      "Comfortable Wear: Crafted to be super light and easy to wear, these earrings for girls are sure to let you enjoy all-day comfort, ensuring you make a grandeur appeal anytime and anywhere.",
      "Customisable Features: Ishhaara’s earrings for women give you full flexibility of personalisation. You can freely add your unique touch that can complement your style and preference.",
    ],
    productFeatures: [
      {
        title: "Timeless Designs",
        description:
          "Every accessory is designed to add a graceful touch to every look. This ensures that, whether you wear it daily, for formal events, or keep it as a lifelong keepsake, it will lend a hint of classic, timeless charm that will never go out of style.",
      },
      {
        title: "Trendsetting Pieces",
        description:
          "All our pieces are curated by drawing major inspiration from the latest fashion jewellery trends. Among so many choices, many of our pieces are styled by even your favourite celebs, ensuring you can bring a fresh, modern, and diva-like look to every occasion.",
      },
      {
        title: "Superior Quality Finish",
        description:
          "Whichever style of jewellery you choose, all the accessories are curated with skin-friendly materials. It is further plated with 18k gold, rhodium or silver plating, allowing you to bring a well-refined look with a lasting radiance wherever you go.",
      },
      {
        title: "Enjoy Comfortable Wear",
        description:
          "Designed in a lightweight style with skin-safe materials, every piece in our wardrobe will offer the highest comfort, letting you make a transition from morning to night effortlessly.",
      },
      {
        title: "Complements Every Outfit and Event",
        description:
          "Be it casual outfits, office wear, or weddings and festivities, our jewellery is designed to align with every type of outfit, be it traditional and fusion wear, and every celebration, be it grand or intimate.",
      },
    ],
    careLabel: [
      "Store the earrings in an air-tight jewellery box or sealed pouch.",
      "Keep it away from body sprays, body lotions, or perfumes.",
      "Avoid using detergents, soaps, or toothpaste to clean your earrings.",
      "Clean your earrings after every use with a soft brush.",
      "Consider storing each piece of jewellery separately in a dry, soft pouch to prevent scratches and tangling.",
      "Always wipe your jewellery gently with a soft, dry cloth after every use to remove sweat and dust.",
      "Always handle your jewellery with care to prevent bending, breaking, and damaging to stones and plating.",
    ],
    stylingTips: [
      "Make One Piece of Jewellery the Focal Point: Choose one piece of jewellery that becomes the focal point of your look. Be it bold or subtle, pick pieces that match your mood and the vibe you're aiming for.",
      "Match Jewellery to Your Outfit for a Harmonized Look: Select jewellery that complements, rather than clashes with, your outfit. Consider matching the tone, texture, or colour of your jewellery to enhance the overall ensemble.",
      "Layer or Stack with Intention for Balanced Appeal: Layer or stack jewellery pieces thoughtfully—whether it's rings, chains, or other accessories. Mixing different lengths, sizes, or designs creates a coordinated, stylish look without being overdone.",
    ],
    stylingInspiration: [
      "Pair these earrings with a sleek ponytail. It will allow you to take the centre stage and show off their shine.",
      "For a bolder look, opt for stacking these trendy earrings with other jewellery like dainty rings or a delicate bracelet. It will add a ‘wow-factor’ look.",
      "Pair these earrings with an off-shoulder top to highlight your neckline. This will bring a stylish and stunning appeal.",
    ],
    images: [
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=1200&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1200&auto=format&fit=crop",
    ],
    tags: ["Earcuff", "Moissanite", "Polki", "Handcrafted", "Earrings", "Festive", "PartyWear"],
    featured: true,
    trending: true,
    newArrival: true,
    status: "published",
  };

  const doc = await Product.findOneAndUpdate({ slug }, productData, {
    upsert: true,
    new: true,
  });

  console.log("Successfully posted product:", doc.name, "(ID:", doc._id, ")");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error posting earcuff product:", err);
  process.exit(1);
});
