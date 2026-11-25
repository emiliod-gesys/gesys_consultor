"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearConversation } from "@/app/actions";
import { hostOf } from "@/lib/format";
import type { ClientSummary, EnvironmentName, EnvironmentSummary } from "@/lib/types";
import { environmentLabel } from "@/lib/types";
import { Button, fieldClass } from "@/components/ui";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 1_200_000;

type Attachment = {
  id: string;
  file: File;
  url: string;
};

export function ChatThread({
  client,
  environment,
  configured,
  initialMessages,
  modelReady,
}: {
  client: ClientSummary;
  environment: EnvironmentName;
  configured: EnvironmentSummary;
  initialMessages: UIMessage[];
  modelReady: boolean;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { clientId: client.id, environment },
      }),
    [client.id, environment],
  );
  const { messages, sendMessage, setMessages, status, stop, error, regenerate, clearError } = useChat({
    id: `${client.id}:${environment}`,
    messages: initialMessages,
    transport,
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef(attachments);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  useEffect(() => {
    return () => {
      for (const item of attachmentsRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  function addFiles(incoming: File[]) {
    const images = incoming.filter((file) => ACCEPTED.has(file.type));
    const sized = images.filter((file) => file.size <= MAX_IMAGE_BYTES);
    const room = Math.max(4 - attachmentsRef.current.length, 0);
    if (images.length !== incoming.length) {
      setNotice("Solo se pueden adjuntar imágenes PNG, JPEG, WEBP o GIF.");
    } else if (sized.length !== images.length) {
      setNotice("Cada imagen debe pesar menos de 1,2 MB.");
    } else if (sized.length > room) {
      setNotice("Puedes adjuntar hasta 4 imágenes.");
    } else {
      setNotice(null);
    }
    const added = sized.slice(0, room).map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    if (added.length === 0) return;
    setAttachments((current) => [...current, ...added]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  function deliver(confirmProduction: boolean) {
    const text = input.trim();
    const files = attachments.map((item) => item.file);
    if (!text && files.length === 0) return;
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    void sendMessage(
      {
        text: text || "Revisa las imágenes adjuntas y relaciónalas con los datos de Odoo.",
        files: transfer.files.length > 0 ? transfer.files : undefined,
      },
      { body: { clientId: client.id, environment, confirmProduction } },
    );
    setInput("");
    for (const item of attachments) URL.revokeObjectURL(item.url);
    setAttachments([]);
    setNotice(null);
  }

  function requestSend() {
    if (busy) return;
    if (!input.trim() && attachments.length === 0) return;
    if (environment === "production") {
      dialogRef.current?.showModal();
      return;
    }
    deliver(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex justify-end">
        <Button
          variant="ghost"
          disabled={clearing || busy || messages.length === 0}
          onClick={() => {
            setClearing(true);
            void clearConversation(client.id, environment)
              .then((result) => {
                if (result.ok) {
                  setMessages([]);
                  clearError();
                } else setNotice(result.error);
              })
              .finally(() => setClearing(false));
          }}
        >
          Nueva conversación
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 ? (
          <div className="rounded-[1.7rem] border border-dashed border-line px-5 py-10">
            <p className="font-display text-3xl">Pregunta sobre {environmentLabel(environment).toLowerCase()}</p>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Pedidos atascados, facturas vencidas, stock o una captura del error. La respuesta sale de{" "}
              {hostOf(configured.baseUrl)}.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}

        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="status-pulse inline-block size-2 animate-pulse rounded-full bg-teal" />
            {status === "submitted" ? "Conectando con Odoo y con Grok…" : "Respondiendo…"}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-3xl border border-danger/40 px-4 py-3 text-sm text-danger">
            <p>{readableError(error)}</p>
            <Button className="mt-3" variant="ghost" onClick={() => regenerate()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 shrink-0 rounded-[1.7rem] border border-line bg-panel p-3"
        onSubmit={(event) => {
          event.preventDefault();
          requestSend();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {attachments.length > 0 ? (
          <ul className="mb-3 flex flex-wrap gap-2">
            {attachments.map((item) => (
              <li key={item.id} className="relative">
                {/* Las vistas previas salen de archivos locales del usuario. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.file.name} className="h-16 w-16 rounded-2xl object-cover" />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink text-xs"
                  aria-label={`Quitar ${item.file.name}`}
                  onClick={() => removeAttachment(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            className={`${fieldClass} min-h-24 flex-1 resize-y`}
            value={input}
            placeholder={
              environment === "production"
                ? "Pregunta sobre producción. Se pedirá confirmación."
                : "Pregunta sobre la base de pruebas. También puedes pegar una captura."
            }
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length === 0) return;
              event.preventDefault();
              addFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                requestSend();
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              Imagen
            </Button>
            {busy ? (
              <Button variant="steel" onClick={() => stop()}>
                Detener
              </Button>
            ) : (
              <Button type="submit" variant={environment === "production" ? "steel" : "solid"}>
                {environment === "production" ? "Consultar producción" : "Enviar"}
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-muted">
          {modelReady
            ? "Puedes soltar o pegar hasta 4 imágenes."
            : "Puedes preparar la consulta, pero el asistente no responderá hasta configurar GEMINI_API_KEY."}
        </p>
        {notice ? <p className="mt-1 text-xs text-danger">{notice}</p> : null}
      </form>

      {environment === "production" ? (
      <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="production-confirm-title">
        <div className="rounded-[1.7rem] border border-steel/40 bg-panel p-5">
          <h2 id="production-confirm-title" className="font-display text-3xl">Confirmar consulta en producción</h2>
          <p className="mt-3 text-sm text-muted">
            Esta pregunta se enviará a la base de producción de {client.name} ({hostOf(configured.baseUrl)}). El
            asistente no puede crear, modificar ni borrar registros, pero leerá datos reales.
          </p>
          <p className="mt-3 line-clamp-4 text-sm">{input || "La consulta incluye imágenes."}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </Button>
            <Button
              variant="steel"
              onClick={() => {
                dialogRef.current?.close();
                deliver(true);
              }}
            >
              Consultar producción
            </Button>
          </div>
        </div>
      </dialog>
      ) : null}
    </div>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  const mine = message.role === "user";
  return (
    <article className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[42rem] rounded-[1.4rem] px-4 py-3 ${mine ? "bg-teal-deep text-paper" : "bg-panel-2"}`}
      >
        <p className="mb-1 text-[0.68rem] tracking-[0.16em] text-muted">{mine ? "TÚ" : "GESYS"}</p>
        <div className="flex flex-col gap-2">
          {message.parts.map((part, index) => (
            <PartView key={`${message.id}-${index}`} part={part} />
          ))}
        </div>
      </div>
    </article>
  );
}

function PartView({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap break-words">{part.text}</p>;
  }
  if (part.type === "file" && part.mediaType?.startsWith("image/") && part.url.startsWith("data:image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={part.url}
        alt={part.filename || "Imagen adjunta"}
        className="max-h-56 rounded-2xl object-contain"
      />
    );
  }
  if (part.type === "reasoning") {
    const text = "text" in part && typeof part.text === "string" ? part.text : "";
    if (!text) return null;
    return (
      <details className="text-sm text-muted">
        <summary>Razonamiento</summary>
        <p className="mt-2 whitespace-pre-wrap">{text}</p>
      </details>
    );
  }
  if (part.type.startsWith("tool-")) {
    const toolPart = part as {
      type: string;
      state?: string;
      input?: { model?: string };
      output?: { error?: string; count?: number };
      errorText?: string;
    };
    const label = toolLabel(part.type);
    const model = toolPart.input?.model;
    const detail =
      toolPart.errorText ||
      toolPart.output?.error ||
      (typeof toolPart.output?.count === "number" ? `${toolPart.output.count} filas` : "");
    const running = toolPart.state === "input-streaming" || toolPart.state === "input-available";
    return (
      <p className="rounded-2xl border border-line px-3 py-2 text-xs text-muted">
        {running ? "Consultando" : "Consulta"} · {label}
        {model ? ` · ${model}` : ""}
        {detail ? ` · ${detail}` : ""}
      </p>
    );
  }
  return null;
}

function toolLabel(type: string): string {
  switch (type.slice("tool-".length)) {
    case "odoo_models":
      return "modelos";
    case "odoo_fields":
      return "campos";
    case "odoo_search_count":
      return "conteo";
    case "odoo_search_read":
      return "lectura";
    case "odoo_read":
      return "ids";
    default:
      return "Odoo";
  }
}

function readableError(error: Error): string {
  const message = error.message.trim();
  if (!message || message.startsWith("<") || message === "Failed to fetch the response.") {
    return "No se pudo completar la consulta.";
  }
  return message.slice(0, 500);
}
