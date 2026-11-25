import type { UIMessage } from "ai";

const MAX_IMAGE_CHARS = 1_600_000;
const MAX_IMAGES = 4;

export function prepareMessagesForModel(messages: UIMessage[]): UIMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Escribe una consulta.");
  }
  if (messages.length > 40) {
    throw new Error("La conversación es demasiado larga. Empieza una nueva.");
  }

  const recent = messages.slice(-24);
  let lastUserIndex = -1;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    if (recent[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) throw new Error("Escribe una consulta.");

  let images = 0;
  return recent.map((message, index) => {
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file") {
        parts.push(part);
        continue;
      }
      if (index !== lastUserIndex) {
        parts.push({ type: "text", text: "[Imagen adjunta en un mensaje anterior]" });
        continue;
      }
      images += 1;
      if (images > MAX_IMAGES) throw new Error("Puedes adjuntar hasta 4 imágenes.");
      if (!part.mediaType?.startsWith("image/")) throw new Error("Solo se aceptan imágenes.");
      if (!part.url?.startsWith("data:image/")) {
        throw new Error("La imagen tiene que ir adjunta al mensaje.");
      }
      if (part.url.length > MAX_IMAGE_CHARS) {
        throw new Error("Una imagen supera el tamaño permitido (1,2 MB).");
      }
      parts.push(part);
    }
    return { ...message, parts };
  });
}

export function messagesForStorage(messages: UIMessage[]): UIMessage[] {
  const stored = messages.slice(-40).map((message) => {
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file") {
        parts.push(part);
        continue;
      }
      const name = part.filename ? `: ${part.filename}` : "";
      parts.push({ type: "text", text: `[Imagen adjunta${name}]` });
    }
    return { ...message, parts };
  });

  while (JSON.stringify(stored).length > 1_200_000 && stored.length > 2) {
    stored.shift();
  }
  return stored;
}

export function parseTranscript(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is UIMessage => {
    if (!item || typeof item !== "object") return false;
    const message = item as Partial<UIMessage>;
    return (
      typeof message.id === "string" &&
      (message.role === "user" || message.role === "assistant") &&
      Array.isArray(message.parts)
    );
  });
}
