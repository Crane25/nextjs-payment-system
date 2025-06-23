import React, { memo } from 'react';

interface WithdrawPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  loading: boolean;
  refreshing: boolean;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (count: number) => void;
}

const WithdrawPagination = memo(({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  loading,
  refreshing,
  onPageChange,
  onItemsPerPageChange
}: WithdrawPaginationProps) => {
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const showPages = 5;
    
    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
    }
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-sm text-gray-600 dark:text-gray-400">
        แสดงรายการ {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} จาก {totalItems.toLocaleString()} รายการ
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1 || loading || refreshing}
          className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← ก่อนหน้า
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <React.Fragment key={index}>
              {page === '...' ? (
                <span className="px-3 py-2 text-gray-500">...</span>
              ) : (
                <button
                  onClick={() => goToPage(page as number)}
                  disabled={loading || refreshing}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                    currentPage === page
                      ? 'bg-orange-500 text-white font-medium'
                      : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages || loading || refreshing}
          className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ถัดไป →
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-gray-600 dark:text-gray-400">แสดง:</label>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
          className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
        <span className="text-gray-600 dark:text-gray-400">รายการ/หน้า</span>
      </div>
    </div>
  );
});

WithdrawPagination.displayName = 'WithdrawPagination';

export default WithdrawPagination; 