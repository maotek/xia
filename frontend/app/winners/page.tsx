import type { Metadata } from "next";
import { TeamsDashboard } from "../components/TeamsInterface";

export const metadata: Metadata = {
  title: "Xiaxia Winners",
  description: "Bekijk de eindstand van spelers en teams.",
};

export default function WinnersPage() {
  return <TeamsDashboard />;
}
