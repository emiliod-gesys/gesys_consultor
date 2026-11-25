"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearConversation } from "@/app/actions";
import { hostOf } from "@/lib/format";
import type { ClientSummary, EnvironmentName, EnvironmentSummary } from "@/lib/types";
import { environmentLabel } from "@/lib/types";
import { Button } from "@/components/ui";

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
        body: {
          clientId: client.id,
          environment,
          confirmProduction: environment === "production",
        },
      }),
    [client.id, environment],
  );
  const { messages, sendMessage, setMessages, status, stop, error, regenerate, clearError, addToolApprovalResponse } =
    useChat({
      id: `${client.id}:${environment}`,
      messages: initialMessages,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef(attachments);
  const busy = status === "submitted" || status === "streaming";
  const pendingApproval = findPendingApproval(messages);

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
    if (composerRef.current) composerRef.current.style.height = "auto";
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
      <div className="flex min-h-0 flex-1 basis-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
        {messages.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted">
            Pregunta sobre {environmentLabel(environment).toLowerCase()}. Pedidos, facturas, stock o una captura. La
            respuesta sale de {hostOf(configured.baseUrl)}.
          </p>
        ) : null}

        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}

        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="status-pulse inline-block size-2 animate-pulse rounded-full bg-teal" />
            {status === "submitted" ? "Consultando…" : "Respondiendo…"}
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

      {pendingApproval ? (
        <div className="mt-2 shrink-0 rounded-2xl border border-teal/40 bg-ink px-3 py-3 text-sm leading-6" role="alertdialog" aria-label="Autorizar cambio en Odoo">
          <p className="text-[0.68rem] tracking-[0.16em] text-teal">AUTORIZACIÓN</p>
          <p className="mt-1 whitespace-pre-wrap">{pendingApproval.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => addToolApprovalResponse({ id: pendingApproval.id, approved: true, reason: "Autorizado por la persona." })}>
              Autorizar
            </Button>
            <Button variant="ghost" onClick={() => addToolApprovalResponse({ id: pendingApproval.id, approved: false, reason: "Cancelado por la persona." })}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <form
        className="mt-1 shrink-0 rounded-2xl border border-line bg-panel p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:p-2"
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

        <div className="flex items-end gap-1.5">
          <textarea
            ref={composerRef}
            rows={1}
            className="max-h-28 min-h-11 w-full flex-1 resize-none rounded-2xl border border-line bg-ink px-3 py-2 text-base leading-6 text-paper outline-none placeholder:text-muted/70"
            value={input}
            placeholder={environment === "production" ? "Pregunta sobre producción." : "Pregunta o pega una captura."}
            onChange={(event) => {
              setInput(event.target.value);
              const field = event.currentTarget;
              field.style.height = "auto";
              field.style.height = `${Math.min(field.scrollHeight, 112)}px`;
            }}
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
          <div className="flex shrink-0 gap-1.5">
            <Button variant="ghost" className="px-3" onClick={() => fileRef.current?.click()}>
              Imagen
            </Button>
            {busy ? (
              <Button variant="steel" onClick={() => stop()}>
                Detener
              </Button>
            ) : (
              <Button type="submit" variant={environment === "production" ? "steel" : "solid"}>
                Enviar
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
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-[0.7rem] text-muted">
            {modelReady ? "Hasta 4 imágenes." : "Falta GEMINI_API_KEY para responder."}
          </p>
          <button
            type="button"
            className="shrink-0 text-[0.7rem] text-muted underline-offset-2 hover:underline disabled:opacity-40"
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
          </button>
        </div>
        {notice ? <p className="mt-1 text-xs text-danger">{notice}</p> : null}
      </form>

      {environment === "production" ? (
      <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="production-confirm-title">
        <div className="rounded-[1.7rem] border border-steel/40 bg-panel p-5">
          <h2 id="production-confirm-title" className="font-display text-3xl">Confirmar consulta en producción</h2>
          <p className="mt-3 text-sm text-muted">
            Esta pregunta se enviará a la base de producción de {client.name} ({hostOf(configured.baseUrl)}). Si
            propone crear, borrar o publicar, verás otra autorización con el detalle antes de que ocurra.
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
        className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 ${mine ? "max-w-[85%] bg-teal-deep text-paper" : "w-full bg-panel-2"}`}
      >
        <p className="mb-1 text-[0.68rem] tracking-[0.16em] text-muted">{mine ? "TÚ" : "GESYS"}</p>
        <div className="flex flex-col gap-2 text-[0.95rem] leading-6 sm:text-base sm:leading-7">
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
    return <ToolPart part={part} />;
  }
  return null;
}

function ToolPart({ part }: { part: UIMessage["parts"][number] }) {
  const toolPart = part as {
    type: string;
    state?: string;
    input?: { model?: string; resumen?: string; ids?: number[]; values?: Record<string, unknown> };
    output?: { error?: string; count?: number; id?: number; deleted?: boolean; publishedBy?: string };
    errorText?: string;
    approval?: { id: string; isAutomatic?: boolean; approved?: boolean; requestReason?: string };
  };
  const name = part.type.slice("tool-".length);
  const mutating = name === "odoo_create" || name === "odoo_unlink" || name === "odoo_publish";
  const waiting = toolPart.state === "approval-requested" && toolPart.approval && !toolPart.approval.isAutomatic;
  if (mutating && waiting) {
    return (
      <p className="rounded-2xl border border-teal/30 px-3 py-2 text-xs text-teal">
        Esperando autorización.
      </p>
    );
  }
  if (mutating && toolPart.state === "approval-responded") {
    return (
      <p className="rounded-2xl border border-line px-3 py-2 text-xs text-muted">
        {toolPart.approval?.approved ? "Autorizado. Aplicando el cambio…" : "Cambio cancelado."}
      </p>
    );
  }
  const label = toolLabel(part.type);
  const model = toolPart.input?.model;
  const detail =
    toolPart.errorText ||
    toolPart.output?.error ||
    (typeof toolPart.output?.count === "number" ? `${toolPart.output.count} filas` : "") ||
    (typeof toolPart.output?.id === "number" ? `id ${toolPart.output.id}` : "") ||
    (toolPart.output?.deleted ? "borrado" : "") ||
    (toolPart.output?.publishedBy ? `publicado vía ${toolPart.output.publishedBy}` : "");
  const running = toolPart.state === "input-streaming" || toolPart.state === "input-available";
  return (
    <p className="rounded-2xl border border-line px-3 py-2 text-xs leading-5 text-muted">
      {running ? "Consultando" : mutating ? "Cambio" : "Consulta"} · {label}
      {model ? ` · ${model}` : ""}
      {detail ? ` · ${detail}` : ""}
    </p>
  );
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
    case "odoo_create":
      return "crear";
    case "odoo_unlink":
      return "borrar";
    case "odoo_publish":
      return "publicar";
    default:
      return "Odoo";
  }
}

function findPendingApproval(messages: UIMessage[]): { id: string; reason: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-")) continue;
      const tool = part as {
        state?: string;
        input?: { resumen?: string };
        approval?: { id: string; isAutomatic?: boolean; requestReason?: string };
      };
      if (tool.state === "approval-requested" && tool.approval && !tool.approval.isAutomatic) {
        return {
          id: tool.approval.id,
          reason: tool.approval.requestReason || tool.input?.resumen || "Cambio en Odoo.",
        };
      }
    }
  }
  return null;
}

function readableError(error: Error): string {
  const message = error.message.trim();
  if (!message || message.startsWith("<") || message === "Failed to fetch the response.") {
    return "No se pudo completar la consulta.";
  }
  return message.slice(0, 500);
}
