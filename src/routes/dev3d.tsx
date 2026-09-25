import { createFileRoute } from "@tanstack/react-router";
import { BuildStudio } from "@/components/garage/BuildStudio";
export const Route = createFileRoute("/dev3d")({ ssr: false, component: () => <div className="p-4"><BuildStudio vehicleLabel="2021 Honda Accord" saved={{ paint: "#8e1b1b", wheel: "racing", rideHeightIn: -2 }} saving={false} onSave={() => {}} /></div> });
