"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ImageIcon,
  FileUp,
  MonitorIcon,
  ShoppingCart,
  ArrowUpIcon,
  Paperclip,
  X,
} from "lucide-react";

/* Chat input — adapted from a v0.dev community component. Colors
   re-mapped from the original neutral/zinc/black palette onto this
   site's --color-* tokens (globals.css) so it matches our theme instead
   of shipping its own dark UI. */

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      // Temporarily shrink to get the right scrollHeight
      textarea.style.height = `${minHeight}px`;

      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY),
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

const CODE_FILE_ACCEPT =
  ".js,.jsx,.ts,.tsx,.html,.htm,.css,.json,.py,.php,.vue,.svelte,.zip,.rb,.java,.go,.rs,.c,.cpp,.md";

export interface SiteBuilderChatProps {
  /** Called when the user submits a prompt (Enter, without Shift). */
  onSubmit?: (value: string, files: File[]) => void;
  /** Locks the input while a previous submission is still in flight. */
  disabled?: boolean;
  /**
   * Mode "conversation en cours" : masque le titre d'accueil et les cartes de
   * suggestion, et resserre les marges. Ces éléments servent à démarrer ; une
   * fois le site affiché, ils volent la place à l'aperçu et aux échanges.
   */
  compact?: boolean;
}

export function SiteBuilderChat({ onSubmit, disabled, compact }: SiteBuilderChatProps) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Keeps the textarea sized correctly when a quick-action card fills it
  // programmatically (adjustHeight is otherwise only called from onChange).
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const fillPrompt = (text: string) => {
    setValue((v) => v || text);
    textareaRef.current?.focus();
  };

  const submit = () => {
    if (disabled) return;
    if (!value.trim() && files.length === 0) return;
    onSubmit?.(value.trim(), files);
    setValue("");
    setFiles([]);
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center w-full mx-auto",
        compact ? "p-0" : "max-w-4xl p-4 space-y-8",
      )}
    >
      {!compact && (
        <h1 className="text-4xl font-bold text-text font-display text-center">
          Quel site voulez-vous créer ?
        </h1>
      )}

      <div className="w-full">
        {/* Hidden pickers, triggered by the paperclip and the two quick-action cards below. */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={codeInputRef}
          type="file"
          accept={CODE_FILE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={attachInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map((file, i) => (
              <span
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <FileUp className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="max-w-[160px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-muted hover:text-text"
                  aria-label={`Retirer ${file.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative bg-surface rounded-xl border border-border">
          <div className="overflow-y-auto">
            <Textarea
              ref={textareaRef}
              value={value}
              disabled={disabled}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                disabled
                  ? "L'agent travaille sur votre site…"
                  : "Décrivez le site que vous voulez, l'agent s'occupe du reste…"
              }
              className={cn(
                "w-full px-4 py-3",
                "resize-none",
                "bg-transparent",
                "border-none",
                "text-text text-sm",
                "focus:outline-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted placeholder:text-sm",
                "min-h-[60px]",
              )}
              style={{
                overflow: "hidden",
              }}
            />
          </div>

          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                className="group p-2 hover:bg-surface-2 rounded-lg transition-colors flex items-center gap-1"
              >
                <Paperclip className="w-4 h-4 text-text" />
                <span className="text-xs text-text-secondary hidden group-hover:inline transition-opacity">
                  Joindre
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={disabled}
                className={cn(
                  "px-1.5 py-1.5 rounded-lg text-sm transition-colors border border-border hover:border-border-strong hover:bg-surface-2 flex items-center justify-between gap-1 disabled:opacity-60 disabled:cursor-not-allowed",
                  value.trim() ? "bg-accent text-white border-accent" : "text-muted",
                )}
              >
                <ArrowUpIcon
                  className={cn("w-4 h-4", value.trim() ? "text-white" : "text-muted")}
                />
                <span className="sr-only">Envoyer</span>
              </button>
            </div>
          </div>
        </div>

        {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 w-full">
          <ActionButton
            icon={<ImageIcon className="w-4 h-4" />}
            label="Donnez-moi une image du site que vous voulez, je pars de là"
            onClick={() => imageInputRef.current?.click()}
          />
          <ActionButton
            icon={<FileUp className="w-4 h-4" />}
            label="Vous avez déjà un code à améliorer ? Envoyez-le moi"
            onClick={() => codeInputRef.current?.click()}
          />
          <ActionButton
            icon={<MonitorIcon className="w-4 h-4" />}
            label="Vous voulez une page d'accueil pour votre entreprise ?"
            onClick={() => fillPrompt("Je veux une page d'accueil pour mon entreprise.")}
          />
          <ActionButton
            icon={<ShoppingCart className="w-4 h-4" />}
            label="Vous voulez un site e-commerce avec gestion de stock ? On y va pas à pas"
            onClick={() =>
              fillPrompt("Je veux un site e-commerce avec gestion de stock, on y va pas à pas.")
            }
          />
        </div>
        )}
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function ActionButton({ icon, label, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 p-4 text-left bg-surface hover:bg-surface-2 rounded-xl border border-border hover:border-border-strong text-text-secondary hover:text-text transition-colors"
    >
      <span className="mt-0.5 shrink-0 text-accent-text">{icon}</span>
      <span className="text-sm leading-snug">{label}</span>
    </button>
  );
}
