import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "../lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
      <span className="text-xs text-slate-500">
        Showing {startItem}-{endItem} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            currentPage === 1
              ? "cursor-not-allowed text-slate-600"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-300",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              "h-7 w-7 rounded-lg text-xs transition-colors",
              page === currentPage
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-300",
            )}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            currentPage === totalPages
              ? "cursor-not-allowed text-slate-600"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-300",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
