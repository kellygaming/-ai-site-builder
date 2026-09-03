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
  PlusIcon,
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

export interface SiteBuilderChatProps {
  /** Called when the user submits a prompt (Enter, without Shift). */
  onSubmit?: (value: string) => void;
}

export function SiteBuilderChat({ onSubmit }: SiteBuilderChatProps) {
  const [value, setValue] = useState("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });

  const submit = () => {
    if (!value.trim()) return;
    onSubmit?.(value.trim());
    setValue("");
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold text-text font-display text-center">
        Quel site voulez-vous créer ?
      </h1>

      <div className="w-full">
        <div className="relative bg-surface rounded-xl border border-border">
          <div className="overflow-y-auto">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Décrivez le site que vous voulez, l'agent s'occupe du reste…"
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
                className="px-2 py-1 rounded-lg text-sm text-text-secondary transition-colors border border-dashed border-border hover:border-border-strong hover:bg-surface-2 flex items-center justify-between gap-1"
              >
                <PlusIcon className="w-4 h-4" />
                Projet
              </button>
              <button
                type="button"
                onClick={submit}
                className={cn(
                  "px-1.5 py-1.5 rounded-lg text-sm transition-colors border border-border hover:border-border-strong hover:bg-surface-2 flex items-center justify-between gap-1",
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 w-full">
          <ActionButton
            icon={<ImageIcon className="w-4 h-4" />}
            label="Donnez-moi une image du site que vous voulez, je pars de là"
          />
          <ActionButton
            icon={<FileUp className="w-4 h-4" />}
            label="Vous avez déjà un code à améliorer ? Envoyez-le moi"
          />
          <ActionButton
            icon={<MonitorIcon className="w-4 h-4" />}
            label="Vous voulez une page d'accueil pour votre entreprise ?"
          />
          <ActionButton
            icon={<ShoppingCart className="w-4 h-4" />}
            label="Vous voulez un site e-commerce avec gestion de stock ? On y va pas à pas"
          />
        </div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
}

function ActionButton({ icon, label }: ActionButtonProps) {
  return (
    <button
      type="button"
      className="flex items-start gap-3 p-4 text-left bg-surface hover:bg-surface-2 rounded-xl border border-border hover:border-border-strong text-text-secondary hover:text-text transition-colors"
    >
      <span className="mt-0.5 shrink-0 text-accent-text">{icon}</span>
      <span className="text-sm leading-snug">{label}</span>
    </button>
  );
}
