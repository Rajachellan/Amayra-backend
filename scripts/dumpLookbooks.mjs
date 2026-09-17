import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const lookbooks = await mongoose.connection.collection("lookbooks").find({}).toArray();
  console.log("FOUND", lookbooks.length, "LOOKBOOKS ON ATLAS:");
  for (const lb of lookbooks) {
    console.log({
      _id: lb._id,
      title: lb.title,
      slug: lb.slug,
      galleryLength: lb.galleryImages?.length,
      imagesCount: lb.images?.length,
      galleryImages: lb.galleryImages?.map(g => ({
        _id: g._id,
        imageUrl: g.imageUrl,
        title: g.title,
        alt: g.alt,
        hotspotsCount: g.hotspots?.length,
        hotspots: g.hotspots,
      })),
    });
  }
  process.exit(0);
}
run().catch(console.error);
