export function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
