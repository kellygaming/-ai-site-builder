"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Formulaire de brief — structure adaptée du pattern "v-form-8" de 21st.dev
   (stepper, cartes de choix cliquables, étape de récapitulatif). Les couleurs
   sont remappées sur nos tokens --color-* et les primitives Radix du composant
   d'origine sont remplacées par des <input> natifs : sur des champs aussi
   simples, le natif offre déjà la navigation clavier et les libellés associés,
   et sept dépendances supplémentaires pour un seul écran ne se justifient pas. */

const STEPS = ["Votre marque", "Le style", "Vous joindre"] as const;

export interface BriefAnswers {
  businessName: string;
  hasLogo: boolean;
  colorChoice: "logo" | "custom" | "agent";
  customColors: string;
  photoChoice: "mine" | "agent";
  whatsapp: string;
  email: string;
  extra: string;
  files: File[];
}

interface BriefFormProps {
  onSubmit: (answers: BriefAnswers) => void;
  onSkip: () => void;
  disabled?: boolean;
}

export function BriefForm({ onSubmit, onSkip, disabled }: BriefFormProps) {
  const [step, setStep] = useState(0);

  const [businessName, setBusinessName] = useState("");
  const [hasLogo, setHasLogo] = useState<boolean | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [colorChoice, setColorChoice] = useState<"logo" | "custom" | "agent">("agent");
  const [customColors, setCustomColors] = useState("");
  const [photoChoice, setPhotoChoice] = useState<"mine" | "agent">("agent");
  const [photos, setPhotos] = useState<File[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [extra, setExtra] = useState("");

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  function finish() {
    onSubmit({
      businessName: businessName.trim(),
      hasLogo: Boolean(logo),
      colorChoice: logo ? colorChoice : colorChoice === "logo" ? "agent" : colorChoice,
      customColors: customColors.trim(),
      photoChoice,
      whatsapp: whatsapp.trim(),
      email: email.trim(),
      extra: extra.trim(),
      files: [...(logo ? [logo] : []), ...photos],
    });
  }

  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-4">
      <ol className="mb-5 flex items-center gap-2">
        {STEPS.map((label, index) => (
          <li className="flex flex-1 items-center gap-2" key={label}>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  index < step
                    ? "bg-accent text-white"
                    : index === step
                      ? "border-2 border-accent text-accent-text"
                      : "border border-border text-muted",
                )}
              >
                {index < step ? <CheckCircle2 className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  index === step ? "text-text" : "text-muted",
                )}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span className={cn("h-px min-w-3 flex-1", index < step ? "bg-accent" : "bg-border")} />
            )}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <Question label="Comment s'appelle votre établissement ?">
            <input
              type="text"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Ex : K-Arena"
              className={inputClass}
            />
          </Question>

          <Question label="Avez-vous un logo ?">
            <div className="flex flex-col gap-2">
              <ChoiceCard
                selected={hasLogo === true}
                onClick={() => {
                  setHasLogo(true);
                  setColorChoice("logo");
                }}
                title="Oui, je l'ai sous la main"
                description="Il apparaîtra directement sur votre site"
              />
              <ChoiceCard
                selected={hasLogo === false}
                onClick={() => {
                  setHasLogo(false);
                  setLogo(null);
                  if (colorChoice === "logo") setColorChoice("agent");
                }}
                title="Non, pas encore"
                description="On écrira joliment le nom de votre marque à la place"
              />
            </div>
          </Question>

          {hasLogo && (
            <div className="rounded-xl border border-dashed border-border-strong p-3">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  setLogo(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              {logo ? (
                <FilePill name={logo.name} onRemove={() => setLogo(null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm text-text-secondary transition-colors hover:text-text"
                >
                  <Upload className="size-4" />
                  Déposez votre logo ici
                </button>
              )}
            </div>
          )}

          <StepButtons
            onNext={() => setStep(1)}
            nextDisabled={hasLogo === null || (hasLogo === true && !logo)}
            onSkip={onSkip}
          />
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Question label="Les couleurs de votre site">
            <div className="flex flex-col gap-2">
              {logo && (
                <ChoiceCard
                  selected={colorChoice === "logo"}
                  onClick={() => setColorChoice("logo")}
                  title="Reprenez celles de mon logo"
                  description="Le plus simple, et votre site restera cohérent"
                />
              )}
              <ChoiceCard
                selected={colorChoice === "custom"}
                onClick={() => setColorChoice("custom")}
                title="J'ai des couleurs précises en tête"
                description="Dites-les avec vos mots, pas besoin de codes"
              />
              <ChoiceCard
                selected={colorChoice === "agent"}
                onClick={() => setColorChoice("agent")}
                title="Choisissez pour moi"
                description="On propose une palette adaptée à votre métier"
              />
            </div>
          </Question>

          {colorChoice === "custom" && (
            <input
              type="text"
              value={customColors}
              onChange={(event) => setCustomColors(event.target.value)}
              placeholder="Ex : rouge et noir, ou des tons chaleureux"
              className={inputClass}
            />
          )}

          <Question label="Les photos">
            <div className="flex flex-col gap-2">
              <ChoiceCard
                selected={photoChoice === "mine"}
                onClick={() => setPhotoChoice("mine")}
                title="J'ai mes propres photos"
                description="Vos vraies photos valent toujours mieux"
              />
              <ChoiceCard
                selected={photoChoice === "agent"}
                onClick={() => {
                  setPhotoChoice("agent");
                  setPhotos([]);
                }}
                title="Trouvez de belles photos pour moi"
                description="On choisit des photos professionnelles libres de droits"
              />
            </div>
          </Question>

          {photoChoice === "mine" && (
            <div className="rounded-xl border border-dashed border-border-strong p-3">
              <input
                ref={photosInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  setPhotos((current) => [...current, ...Array.from(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-col gap-2">
                {photos.map((file, index) => (
                  <FilePill
                    key={`${file.name}-${index}`}
                    name={file.name}
                    onRemove={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => photosInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm text-text-secondary transition-colors hover:text-text"
                >
                  <ImageIcon className="size-4" />
                  {photos.length > 0 ? "Ajouter une autre photo" : "Choisir mes photos"}
                </button>
              </div>
            </div>
          )}

          <StepButtons onBack={() => setStep(0)} onNext={() => setStep(2)} onSkip={onSkip} />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <Question label="Par où vos clients doivent-ils vous joindre ?">
            <div className="flex flex-col gap-2">
              <input
                type="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="WhatsApp ou téléphone"
                className={inputClass}
              />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Adresse e-mail"
                className={inputClass}
              />
            </div>
          </Question>

          <Question label="Autre chose à nous dire ? (facultatif)">
            <textarea
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              rows={3}
              placeholder="Vos horaires, votre adresse, ce qui vous rend unique…"
              className={cn(inputClass, "resize-none")}
            />
          </Question>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className={secondaryButtonClass}>
                Retour
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={disabled}
                className={cn(primaryButtonClass, "flex-1")}
              >
                Créer mon site
              </button>
            </div>
            <SkipLink onSkip={onSkip} />
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none";

const primaryButtonClass =
  "rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50";

const secondaryButtonClass =
  "rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text";

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text">{label}</p>
      {children}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-accent bg-surface-2"
          : "border-border hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-accent" : "border-border-strong",
        )}
      >
        {selected && <span className="size-2 rounded-full bg-accent" />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{title}</span>
        <span className="text-xs text-text-secondary">{description}</span>
      </span>
    </button>
  );
}

function FilePill({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
      <ImageIcon className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">{name}</span>
      <button type="button" onClick={onRemove} className="text-muted hover:text-text" aria-label={`Retirer ${name}`}>
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function StepButtons({
  onBack,
  onNext,
  nextDisabled,
  onSkip,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className={secondaryButtonClass}>
            Retour
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={cn(primaryButtonClass, "flex-1")}
        >
          Continuer
        </button>
      </div>
      <SkipLink onSkip={onSkip} />
    </div>
  );
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      onClick={onSkip}
      className="text-center text-xs text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
    >
      Passer — lancez-vous avec vos propres choix
    </button>
  );
}
