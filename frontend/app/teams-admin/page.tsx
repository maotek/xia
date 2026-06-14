import type { Metadata } from "next";
import { TeamsAdmin } from "../components/TeamsInterface";

export const metadata: Metadata = {
  title: "Xiaxia Teambeheer",
  description: "Maak teams en beheer spelers en punten.",
};

export default function TeamsAdminPage() {
  return <TeamsAdmin />;
}
