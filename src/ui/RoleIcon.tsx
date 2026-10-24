import type { RoleId } from "@/roles/model";
import { IconLikeShapes, IconNotification, IconProfile2User } from "./kit/icons";

/**
 * A team's icon, the same on the team picker and in the sidebar, from Fair's own set
 * (new-agency-dashboard/src/components/icons): the bell for the PR team's watch, creators for
 * Brand & KOL, likes for the own accounts.
 */
const ICON: Record<RoleId, typeof IconNotification> = { pr: IconNotification, brand_kol: IconProfile2User, social: IconLikeShapes };

export function RoleIcon({ role, size = 20, className }: { role: RoleId; size?: number; className?: string }) {
  const Icon = ICON[role];
  return <Icon size={size} className={className} />;
}
