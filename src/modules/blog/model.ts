import mongoose, { Schema, type InferSchemaType } from "mongoose";

const blogSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    excerpt: { type: String },
    content: { type: String, required: true },
    coverImage: { type: String },
    author: { type: String },
    tags: [{ type: String }],
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    keywords: [{ type: String }],
  },
  { timestamps: true }
);

blogSchema.index({ publishedAt: -1 });

export type BlogDoc = InferSchemaType<typeof blogSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Blog = mongoose.model("Blog", blogSchema);
