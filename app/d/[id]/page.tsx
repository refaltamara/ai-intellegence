/** Decisions were retired on 30 Sep 2026: a decision's thread opens in Chats, and the decision itself goes to Chats. */
import { redirect } from "next/navigation";

export default async function DecisionPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  redirect(c && /^[0-9a-f-]{36}$/.test(c) ? `/?c=${c}` : "/");
}
