import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';

interface VirtualScrollTableProps<T> {
  data: T[];
  itemHeight: number;
  height?: number;
  maxHeight?: number | string;
  minHeight?: number;
  autoHeight?: boolean; // New prop to enable auto-height calculation
  renderItem: (props: {
    index: number;
    style: React.CSSProperties;
    data: T[];
    onStatusUpdate?: (id: string, status: string) => void;
  }) => React.ReactElement;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  threshold?: number;
  onStatusUpdate?: (id: string, status: string) => void;
}

export function VirtualScrollTable<T>({
  data,
  itemHeight,
  height,
  maxHeight = '80vh',
  minHeight = 200,
  autoHeight = true,
  renderItem,
  loading = false,
  onLoadMore,
  hasMore = false,
  threshold = 10,
  onStatusUpdate
}: VirtualScrollTableProps<T>) {
  const listRef = useRef<List>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback((props: any) => {
    const { scrollTop } = props;
    setScrollTop(scrollTop);
    
    // Trigger load more when near bottom
    if (onLoadMore && hasMore && !loading) {
      const scrolledToBottom = 
        scrollTop + height >= (data.length * itemHeight) - (threshold * itemHeight);
      
      if (scrolledToBottom) {
        onLoadMore();
      }
    }
  }, [data.length, height, itemHeight, onLoadMore, hasMore, loading, threshold]);

  // Enhanced render function with loading state
  const enhancedRenderItem = useCallback(
    (props: any) => {
      const { index, style } = props;
      
      // Show loading indicator at the end
      if (loading && index === data.length) {
        return (
          <div style={style} className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-500">กำลังโหลด...</span>
          </div>
        );
      }
      
      // Pass the correct props to renderItem
      const itemProps = {
        index,
        style,
        data: data,
        onStatusUpdate
      };
      
      return renderItem(itemProps);
    },
    [renderItem, data, loading, onStatusUpdate]
  );

  // Calculate total item count including loading indicator
  const itemCount = loading ? data.length + 1 : data.length;

  // Calculate optimal height
  const calculatedHeight = height || (() => {
    const contentHeight = itemCount * itemHeight;
    const minHeightValue = minHeight;
    
    // Handle string maxHeight (like '80vh')
    let maxHeightValue: number;
    if (typeof maxHeight === 'string') {
      if (maxHeight.includes('vh')) {
        const vhValue = parseFloat(maxHeight);
        maxHeightValue = (window.innerHeight * vhValue) / 100;
      } else if (maxHeight.includes('px')) {
        maxHeightValue = parseFloat(maxHeight);
      } else {
        maxHeightValue = parseFloat(maxHeight) || 800; // increased fallback
      }
    } else {
      maxHeightValue = maxHeight;
    }
    
    // If autoHeight is disabled, just use maxHeight
    if (!autoHeight) {
      return Math.min(Math.max(contentHeight, minHeightValue), maxHeightValue);
    }
    
    // Smart height calculation for better UX
    if (itemCount === 0) {
      return minHeightValue;
    }
    
    // Calculate actual content height
    const actualContentHeight = itemCount * itemHeight;
    
    if (itemCount <= 20) {
      // For small datasets (≤20 items), show all items without scrolling
      // Add some padding for better appearance
      const paddedHeight = actualContentHeight + 40; // 40px padding
      return Math.max(paddedHeight, minHeightValue);
    } else if (itemCount <= 50) {
      // For medium datasets (21-50 items), show all items but limit to reasonable height
      const paddedHeight = actualContentHeight + itemHeight; // Add one item height as padding
      return Math.min(paddedHeight, maxHeightValue * 0.8);
    } else {
      // For large datasets (>50 items), use maxHeight to enable scrolling
      return maxHeightValue;
    }
  })();

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      <List
        ref={listRef}
        height={calculatedHeight}
        width="100%"
        itemCount={itemCount}
        itemSize={itemHeight}
        onScroll={handleScroll}
        overscanCount={5}
        itemData={data}
        className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#CBD5E0 transparent'
        }}
      >
        {enhancedRenderItem}
      </List>
      
      {/* Height indicator for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 right-2 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded z-10 pointer-events-none">
          H: {calculatedHeight}px | Items: {itemCount} | Content: {(itemCount * itemHeight)}px | Auto: {autoHeight ? 'ON' : 'OFF'}
        </div>
      )}
    </div>
  );
}

// Table row component for bot transactions
export const BotTransactionRow = React.memo(({ 
  index, 
  style, 
  data,
  onStatusUpdate
}: {
  index: number;
  style: React.CSSProperties;
  data: any[];
  onStatusUpdate?: (id: string, status: string) => void;
}) => {
  const transaction = data[index];
  
  if (!transaction) return null;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const statusColors: { [key: string]: string } = {
    'รอโอน': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    'กำลังโอน': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    'สำเร็จ': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    'ยกเลิก': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    'ล้มเหลว': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  };

  return (
    <div 
      style={style}
      className={`
        flex items-center border-b border-gray-100 dark:border-gray-700 
        hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200
        ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}
      `}
    >
      <div className="flex-1 grid grid-cols-10 gap-4 px-4 py-3 text-sm">
        <div className="font-medium text-gray-900 dark:text-white">
          {formatDate(transaction.createdAt)}
        </div>
        <div className="font-mono text-blue-600 dark:text-blue-400 font-medium">
          {transaction.transactionId}
        </div>
        <div className="font-medium text-gray-900 dark:text-white">
          {transaction.customerUsername}
        </div>
        <div className="text-gray-900 dark:text-white">
          {transaction.websiteName}
        </div>
        <div className="text-gray-700 dark:text-gray-300">
          {transaction.bankName}
        </div>
        <div className="font-mono text-gray-700 dark:text-gray-300">
          {transaction.accountNumber}
        </div>
        <div className="text-gray-900 dark:text-white">
          {transaction.realName}
        </div>
        <div className="text-center font-bold text-red-600 dark:text-red-400">
          -฿{formatAmount(transaction.amount)}
        </div>
        <div className="text-center">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[transaction.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
            {transaction.status}
          </span>
        </div>
        <div className="text-center">
          <select
            value={transaction.status}
            onChange={(e) => {
              if (onStatusUpdate) {
                onStatusUpdate(transaction.id, e.target.value);
              }
            }}
            className="text-xs border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="รอโอน">รอโอน</option>
            <option value="กำลังโอน">กำลังโอน</option>
            <option value="สำเร็จ">สำเร็จ</option>
            <option value="ยกเลิก">ยกเลิก</option>
            <option value="ล้มเหลว">ล้มเหลว</option>
          </select>
        </div>
      </div>
    </div>
  );
});

BotTransactionRow.displayName = 'BotTransactionRow';

// Table row component for topup history
export const TopupHistoryRow = React.memo(({ 
  index, 
  style, 
  data,
  teams
}: {
  index: number;
  style: React.CSSProperties;
  data: any[];
  teams?: any[];
}) => {
  const record = data[index];
  
  if (!record) return null;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'สำเร็จ';
      case 'pending': return 'รอดำเนินการ';
      case 'failed': return 'ล้มเหลว';
      default: return 'ไม่ทราบสถานะ';
    }
  };

  const getTeamColor = (teamId: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    ];
    
    const index = teamId ? teamId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length : 0;
    return colors[index];
  };

  const showTeamColumn = teams && teams.length > 1;

  return (
    <div 
      style={style}
      className={`
        flex items-center border-b border-gray-100 dark:border-gray-700 
        hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200
        ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}
      `}
    >
      <div className={`flex-1 grid gap-4 px-4 py-3 text-sm ${showTeamColumn ? 'grid-cols-9' : 'grid-cols-8'}`}>
        <div className="font-medium text-gray-900 dark:text-white">
          {formatDate(record.timestamp)}
        </div>
        <div className="font-semibold text-gray-900 dark:text-white">
          {record.websiteName}
        </div>
        {showTeamColumn && (
          <div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTeamColor(record.teamId || 'no-team')}`}>
              {record.teamName || 'ไม่ระบุทีม'}
            </span>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {(record.topupBy || 'ผู้ใช้').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {record.topupBy || 'ผู้ใช้ไม่ระบุ'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              @{record.topupByUsername || record.topupByEmail?.split('@')[0] || (record.topupByUid ? record.topupByUid.substring(0, 8) : 'user')}
            </div>
          </div>
        </div>
        <div className="text-center font-bold text-green-600 dark:text-green-400">
          +฿{record.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-center font-medium text-gray-700 dark:text-gray-300">
          {record.balanceAfter !== undefined ? 
            `฿${(record.balanceAfter - record.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
            '-'
          }
        </div>
        <div className="text-center font-bold text-blue-600 dark:text-blue-400">
          {record.balanceAfter !== undefined ? 
            `฿${record.balanceAfter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
            '-'
          }
        </div>
        <div className="text-gray-700 dark:text-gray-300 max-w-xs">
          {record.note ? (
            record.note.length > 30 ? (
              <span title={record.note} className="cursor-help">
                {record.note.substring(0, 30)}...
              </span>
            ) : (
              record.note
            )
          ) : (
            '-'
          )}
        </div>
        <div className="text-center">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
            {getStatusText(record.status)}
          </span>
        </div>
      </div>
    </div>
  );
});

TopupHistoryRow.displayName = 'TopupHistoryRow';