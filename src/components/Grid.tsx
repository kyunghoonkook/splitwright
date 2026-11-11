"use client";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GetRowIdParams, type RowClassParams } from "ag-grid-community";
import { forwardRef } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

export const swTheme = themeQuartz.withParams({
  fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 600,
  rowHeight: 36,
  headerHeight: 36,
  borderRadius: 0,
  wrapperBorderRadius: 0,
  accentColor: "#141614",
  foregroundColor: "#141614",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#E2E5E0",
  borderColor: "#C9CEC8",
  rowBorder: { color: "#DDE1DC" },
  columnBorder: { color: "#DDE1DC" },
  headerColumnBorder: { color: "#C9CEC8" },
  oddRowBackgroundColor: "#ffffff",
  selectedRowBackgroundColor: "#FFF3B8",
  rowHoverColor: "#F6F7F5",
  spacing: 6,
  wrapperBorder: { color: "#C9CEC8" },
});

type Props = {
  rows: any[];
  cols: ColDef[];
  getRowId?: (p: GetRowIdParams) => string;
  rowClassRules?: Record<string, (p: RowClassParams) => boolean>;
  onRowClicked?: (row: any) => void;
  quickFilter?: string;
  height?: number | string;
  pinnedBottom?: any[];
};

export const Grid = forwardRef<AgGridReact, Props>(function Grid({ rows, cols, getRowId, rowClassRules, onRowClicked, quickFilter, height, pinnedBottom }, ref) {
  return (
    <div className="gridbox" style={height ? { height } : undefined}>
      <AgGridReact
        ref={ref}
        theme={swTheme}
        rowData={rows}
        columnDefs={cols}
        getRowId={getRowId}
        rowClassRules={rowClassRules}
        quickFilterText={quickFilter}
        animateRows={false}
        pinnedBottomRowData={pinnedBottom}
        defaultColDef={{ sortable: true, resizable: true, filter: true, minWidth: 80 }}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onRowClicked={(e) => onRowClicked?.(e.data)}
      />
    </div>
  );
});

export const moneyCol = (field: string, headerName: string, extra: Partial<ColDef> = {}): ColDef => ({
  field,
  headerName,
  type: "rightAligned",
  cellClass: "num",
  filter: "agNumberColumnFilter",
  valueFormatter: (p) => (p.value === null || p.value === undefined ? "" : `${p.value < 0 ? "-" : ""}$${(Math.abs(p.value) / 100).toFixed(2)}`),
  width: 110,
  ...extra,
});
