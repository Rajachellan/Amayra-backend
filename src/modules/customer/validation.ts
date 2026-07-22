import { z } from "zod";

/** Letters (incl. Unicode), spaces, apostrophe, hyphen, period — 2–80 chars */
export const PERSON_NAME_RE =
  /^(?=.{2,80}$)[\p{L}][\p{L}\p{M}'’.\-]*(?: [\p{L}][\p{L}\p{M}'’.\-]*)*$/u;

/** Production-grade email (local@domain.tld), rejects consecutive dots / spaces */
export const EMAIL_RE =
  /^(?=.{3,254}$)(?!.*\.\.)[A-Za-z0-9](?:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** India mobile: optional +91 / 0, then 10 digits starting 6–9 */
export const IN_PHONE_RE = /^(?:\+?91[\s-]?|0)?[6-9]\d{9}$/;

/** Indian PIN: first digit 1–9, then 5 digits */
export const IN_PINCODE_RE = /^[1-9][0-9]{5}$/;

/** City / state: letters, spaces, hyphen, apostrophe */
export const PLACE_NAME_RE = /^(?=.{2,60}$)[\p{L}][\p{L}\p{M}'’.\-]*(?: [\p{L}][\p{L}\p{M}'’.\-]*)*$/u;

/** Street line: printable, no control chars */
export const ADDRESS_LINE_RE = /^(?=.{3,120}$)[^\p{Cc}\p{Cf}]+$/u;

const LABEL_RE = /^(?=.{1,40}$)[\p{L}\p{N}][\p{L}\p{N}\p{M} '’.\-/]*$/u;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+91${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return raw.trim();
}

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters")
  .regex(PERSON_NAME_RE, "Use letters only (spaces, apostrophes, and hyphens allowed)");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a valid email")
  .max(254, "Email is too long")
  .regex(EMAIL_RE, "Enter a valid email address (e.g. name@example.com)");

export const phoneSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid mobile number")
  .max(16, "Phone number is too long")
  .regex(IN_PHONE_RE, "Enter a valid Indian mobile (10 digits, starting 6–9)")
  .transform(normalizePhone);

export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .default("Home")
    .transform((v) => (v.length ? v : "Home"))
    .pipe(
      z
        .string()
        .min(1)
        .max(40)
        .regex(LABEL_RE, "Label may only contain letters, numbers, and basic punctuation")
    ),
  fullName: personNameSchema,
  phone: phoneSchema,
  line1: z
    .string()
    .trim()
    .regex(ADDRESS_LINE_RE, "Enter a valid street address (3–120 characters)"),
  line2: z
    .string()
    .trim()
    .max(120)
    .regex(/^[^\p{Cc}\p{Cf}]*$/u, "Invalid characters in address line 2")
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  city: z.string().trim().regex(PLACE_NAME_RE, "Enter a valid city name"),
  state: z.string().trim().regex(PLACE_NAME_RE, "Enter a valid state name"),
  pincode: z.string().trim().regex(IN_PINCODE_RE, "Enter a valid 6-digit PIN code"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .default("IN")
    .transform((v) => (v.length ? v : "IN"))
    .pipe(z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code (e.g. IN)")),
  isDefault: z.boolean().optional().default(false),
});

export const updateProfileSchema = z
  .object({
    name: personNameSchema.optional(),
    phone: z
      .union([z.literal(""), phoneSchema])
      .optional()
      .transform((v) => (v === "" ? "" : v)),
  })
  .refine((d) => d.name !== undefined || d.phone !== undefined, {
    message: "Provide at least one field to update (name or phone)",
  });

export type AddressInput = z.infer<typeof addressSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join("; ");
}
