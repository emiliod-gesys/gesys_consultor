import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.2.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.51.100.0", 24, "ipv4");
blocked.addSubnet("203.0.113.0", 24, "ipv4");
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

const PRIVATE_URL_MESSAGE =
  "Las direcciones privadas están bloqueadas. Define ODOO_ALLOW_PRIVATE_URLS=true solo si esa base es tuya.";

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return blocked.check(mapped, "ipv4");
  }
  const kind = isIP(address);
  if (kind === 4) return blocked.check(address, "ipv4");
  if (kind === 6) return blocked.check(address, "ipv6");
  return true;
}

function privateUrlsAllowed(): boolean {
  return process.env.ODOO_ALLOW_PRIVATE_URLS === "true";
}

export async function assertPublicUrl(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("La URL no es válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("La URL debe usar http o https.");
  }
  if (url.username || url.password) {
    throw new Error("La URL no debe incluir usuario ni contraseña.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Esa dirección no está permitida.");
  }
  if (/^\d+$/.test(hostname)) {
    throw new Error("Usa el nombre de host de Odoo, no una IP decimal.");
  }

  const allowPrivate = privateUrlsAllowed();
  if (isIP(hostname) !== 0) {
    if (!allowPrivate && isPrivateAddress(hostname)) throw new Error(PRIVATE_URL_MESSAGE);
  } else if (!allowPrivate) {
    let records: { address: string }[];
    try {
      records = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("No se pudo resolver el host de Odoo.");
    }
    if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
      throw new Error("El host resuelve a una dirección privada, que está bloqueada.");
    }
  }

  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}
