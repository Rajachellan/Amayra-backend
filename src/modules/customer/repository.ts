import { Customer } from "./model.js";

export const customerRepository = {
  findByEmail(email: string) {
    return Customer.findOne({ email: email.toLowerCase().trim() });
  },

  findById(id: string) {
    return Customer.findById(id);
  },

  findByIdLean(id: string) {
    return Customer.findById(id).lean();
  },

  findByGoogleOrEmail(googleId: string, email: string) {
    return Customer.findOne({ $or: [{ googleId }, { email }] });
  },

  create(data: Record<string, unknown>) {
    return Customer.create(data);
  },

  updateById(id: string, update: Record<string, unknown>) {
    return Customer.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
  },
};
