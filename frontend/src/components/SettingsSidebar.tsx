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
    <div className="space-y-2">
      <div className="px-3">
        <ThemeToggle />
      </div>

      <RemoteAccessSection />
      <ThresholdSettingsSection />
      <StorageLocationsSection />
      <DangerZoneSection meta={meta} />
      <BackupsSection />
      <DuplicatesSection meta={meta} />
      <ExportImportSection />
    </div>
  );
}
