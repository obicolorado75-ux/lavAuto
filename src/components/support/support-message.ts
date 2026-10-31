import { PAGE_LABELS } from "@/components/support/support-page-labels"

/** Message WhatsApp pré-rempli, assez précis pour éviter un aller-retour. */
export function buildSupportMessage(options: {
  contactName: string | null
  organizationName: string | null
  planName: string | null
  pageLabel: string
}): string {
  const who = options.contactName ? `${options.contactName}` : "un utilisateur"
  const station = options.organizationName ? ` de la station ${options.organizationName}` : ""
  const plan = options.planName ? ` (forfait ${options.planName})` : ""
  return `Bonjour WashPilot CI, je suis ${who}${station}${plan}. J’ai besoin d’aide concernant ${options.pageLabel} : `
}

export function currentPageLabel(pathname: string): string {
  return PAGE_LABELS.find((entry) => pathname.startsWith(entry.prefix))?.label ?? "l’application"
}
