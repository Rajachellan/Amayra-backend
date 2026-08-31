import { ReturnReason } from "./reason.model.js";

export const INITIAL_REASONS = [
  {
    title: "Product delivered is different from the original order",
    code: "DIFFERENT_PRODUCT",
    type: "RETURN",
    isActive: true,
    sortOrder: 1,
  },
  {
    title: "Product arrived damaged",
    code: "ARRIVED_DAMAGED",
    type: "RETURN",
    isActive: true,
    sortOrder: 2,
  },
  {
    title: "Product has missing parts",
    code: "MISSING_PARTS",
    type: "RETURN",
    isActive: true,
    sortOrder: 3,
  },
  {
    title: "Changed my mind",
    code: "CHANGED_MIND",
    type: "EXCHANGE",
    isActive: true,
    sortOrder: 1,
  },
  {
    title: "Size mismatch",
    code: "SIZE_MISMATCH",
    type: "EXCHANGE",
    isActive: true,
    sortOrder: 2,
  },
];

export async function seedInitialReasonsIfEmpty(): Promise<void> {
  const count = await ReturnReason.countDocuments();
  if (count === 0) {
    await ReturnReason.insertMany(INITIAL_REASONS);
  }
}

export async function getActiveReasons(type?: "RETURN" | "EXCHANGE"): Promise<any[]> {
  await seedInitialReasonsIfEmpty();
  const filter: any = { isActive: true };
  if (type) {
    filter.$or = [{ type }, { type: "BOTH" }];
  }
  return ReturnReason.find(filter).sort({ sortOrder: 1, createdAt: 1 });
}

export async function getAllReasonsAdmin(): Promise<any[]> {
  await seedInitialReasonsIfEmpty();
  return ReturnReason.find().sort({ sortOrder: 1, createdAt: 1 });
}

export async function createReasonAdmin(data: {
  title: string;
  code: string;
  type: "RETURN" | "EXCHANGE" | "BOTH";
  isActive?: boolean;
  sortOrder?: number;
}): Promise<any> {
  return ReturnReason.create(data);
}

export async function updateReasonAdmin(
  id: string,
  data: Partial<{
    title: string;
    type: "RETURN" | "EXCHANGE" | "BOTH";
    isActive: boolean;
    sortOrder: number;
  }>
): Promise<any> {
  return ReturnReason.findByIdAndUpdate(id, { $set: data }, { new: true });
}
