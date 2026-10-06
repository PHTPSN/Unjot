import { ConversationPage } from "./conversation-page.tsx";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const value = (await searchParams).conversationId;
  const conversationId = typeof value === "string" ? value : undefined;

  return <ConversationPage conversationId={conversationId} />;
}
