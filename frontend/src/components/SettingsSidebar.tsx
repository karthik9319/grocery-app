import type { Meta } from "@/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RemoteAccessSection } from "@/components/RemoteAccessSection";
import { ThresholdSettingsSection } from "@/components/ThresholdSettingsSection";
import { StorageLocationsSection } from "@/components/StorageLocationsSection";
import { DangerZoneSection } from "@/components/DangerZoneSection";
import { BackupsSection } from "@/components/BackupsSection";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { ExportImportSection } from "@/components/ExportImportSection";
import { InstallOfflineSection } from "@/components/InstallOfflineSection";
import { ChevronDown, Palette } from "lucide-react";

export function SettingsSidebar({ meta }: { meta: Meta }) {
  const sections = [
    { key: "backups", content: <BackupsSection /> },
    { key: "install", content: <InstallOfflineSection /> },
    { key: "remote", content: <RemoteAccessSection /> },
    { key: "thresholds", content: <ThresholdSettingsSection /> },
    { key: "locations", content: <StorageLocationsSection /> },
    { key: "duplicates", content: <DuplicatesSection meta={meta} /> },
    { key: "export", content: <ExportImportSection /> },
    { key: "danger", content: <DangerZoneSection meta={meta} /> },
  ];

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface-solid shadow-md">
      <section className="border-b border-line p-2">
        <details className="group rounded-2xl">
          <summary className="flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface">
            <Palette className="h-[18px] w-[18px] text-subtle" /> Appearance
            <ChevronDown className="ml-auto h-4 w-4 text-subtle transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-3 pb-3 pt-2"><ThemeToggle /></div>
        </details>
      </section>
      {sections.map((section) => (
        <section key={section.key} className="border-b border-line p-2 last:border-b-0">
          {section.content}
        </section>
      ))}
    </div>
  );
}
