export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/[^\d]/g, "");

  if (!digits) {
    throw new Error("Phone number must contain digits");
  }

  return digits;
}
