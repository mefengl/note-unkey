import type { WorkspaceProps } from "../logs-client";
import { LogsDateTime } from "./components/logs-datetime";
import { LogsFilters } from "./components/logs-filters";
import { LogsRefresh } from "./components/logs-refresh";
import { LogsSearch } from "./components/logs-search";

export function AuditLogsControls(props: WorkspaceProps) {
  return (
    <div className="flex flex-col border-b border-gray-4 ">
      <div className="px-3 py-1 w-full justify-between flex items-center">
        <div className="flex gap-2">
          <div className="flex gap-2 items-center">
            <LogsSearch />
          </div>
          <div className="flex gap-2 items-center">
            <LogsFilters {...props} />
          </div>
          <div className="flex gap-2 items-center">
            <LogsDateTime />
          </div>
        </div>

        <div className="flex gap-2">
          <LogsRefresh />
        </div>
      </div>
    </div>
  );
}
