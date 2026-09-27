import type { Meta } from "@/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RemoteAccessSection } from "@/components/RemoteAccessSection";
import { ThresholdSettingsSection } from "@/components/ThresholdSettingsSection";
import { StorageLocationsSection } from "@/components/StorageLocationsSection";
import { DangerZoneSection } from "@/components/DangerZoneSection";
import { BackupsSection } from "@/components/BackupsSection";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { ExportImportSection } from "@/components/ExportImportSection";

export function SettingsSidebar({ meta }: { meta: Meta }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="glass rounded-2xl p-5 shadow-md">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-subtle">Appearance</p>
        <ThemeToggle />
      </section>

      {[<RemoteAccessSection />, <ThresholdSettingsSection />, <StorageLocationsSection />,
        <BackupsSection />, <DuplicatesSection meta={meta} />, <ExportImportSection />,
        <DangerZoneSection meta={meta} />].map((section, index) => (
        <section key={index} className="glass self-start rounded-2xl p-2 shadow-md">
          {section}
        </section>
      ))}
    </div>
  );
}
