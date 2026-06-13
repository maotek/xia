import type { Metadata } from "next";
import { ChatInterface } from "../components/ChatInterface";

export const metadata: Metadata = {
  title: "Xiaxia AI Chat",
  description: "Chat rechtstreeks met het lokale Ollama-model.",
};

export default function ChatPage() {
  return <ChatInterface />;
}
