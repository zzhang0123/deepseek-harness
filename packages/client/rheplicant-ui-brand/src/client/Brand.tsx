import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type RheplicantBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/** Render the rheplicant mark (a plain diamond glyph). */
export function RheplicantBrandMark({ size, className }: RheplicantBrandMarkProps) {
  return <span className={className} style={{ fontSize: size }}>◆</span>
}

/** Render the rheplicant name wordmark. */
export function RheplicantBrandName() {
  return <span>rheplicant</span>
}
