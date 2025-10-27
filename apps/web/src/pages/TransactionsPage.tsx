import { useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import dayjs from 'dayjs';

const TransactionsPage = () => {
  const { state, loading } = useFinancialData();
  const [sortField, setSortField] = useState<'date' | 'amount' | 'description'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const sortedTransactions = useMemo(() => {
    let filtered = state.transactions;

    if (filterCategory !== 'all') {
      filtered = filtered.filter((txn) => txn.category === filterCategory);
    }

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = a.postedDate.localeCompare(b.postedDate);
      } else if (sortField === 'amount') {
        comparison = a.amount - b.amount;
      } else {
        comparison = a.description.localeCompare(b.description);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [state.transactions, sortField, sortDirection, filterCategory]);

  const categories = useMemo(() => {
    const cats = new Set(state.transactions.map((t) => t.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [state.transactions]);

  const handleSort = (field: 'date' | 'amount' | 'description') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (loading) {
    return (
      <div className="card">
        <h2>Loading transactions…</h2>
      </div>
    );
  }

  if (state.transactions.length === 0) {
    return (
      <div className="card">
        <h2>No Transactions</h2>
        <p>Connect with Plaid to import your transaction history and review it here.</p>
      </div>
    );
  }

  const totalInflow = sortedTransactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalOutflow = Math.abs(sortedTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));

  return (
    <div className="card">
      <h2>Transaction Review</h2>
      <p style={{ marginBottom: 24, color: '#6b7280' }}>
        Review all transactions imported from your connected accounts. Verify descriptions, amounts, and categories.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Filter by Category</strong>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All Categories ({state.transactions.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({state.transactions.filter((t) => t.category === cat).length})
              </option>
            ))}
            <option value="undefined">
              Uncategorized ({state.transactions.filter((t) => !t.category).length})
            </option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          <Metric label="Total Inflows" value={formatCurrency(totalInflow)} color="#22c55e" />
          <Metric label="Total Outflows" value={formatCurrency(totalOutflow)} color="#ef4444" />
          <Metric label="Net" value={formatCurrency(totalInflow - totalOutflow)} />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>
                Description {sortField === 'description' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Category</th>
              <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Amount {sortField === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {sortedTransactions.map((txn) => {
              const account = state.accounts.find((a) => a.accountId === txn.accountId);
              return (
                <tr key={txn.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dayjs(txn.postedDate).format('MMM D, YYYY')}</td>
                  <td>{txn.description}</td>
                  <td>
                    <span className="chip" style={{ fontSize: '0.85rem' }}>
                      {txn.category || 'Uncategorized'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: txn.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                    {formatCurrency(Math.abs(txn.amount))}
                    <span style={{ fontSize: '0.85rem', marginLeft: 4 }}>
                      {txn.amount >= 0 ? '↑' : '↓'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.9rem', color: '#6b7280' }}>{account?.name || 'Unknown'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedTransactions.length > 0 && (
        <p style={{ marginTop: 24, fontSize: '0.9rem', color: '#6b7280' }}>
          Showing {sortedTransactions.length} transaction{sortedTransactions.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

const Metric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div>
    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#6b7280' }}>{label}</p>
    <strong style={{ fontSize: '1.25rem', color }}>{value}</strong>
  </div>
);

const formatCurrency = (input: number) =>
  input.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  fontSize: '0.95rem',
  width: '100%',
  cursor: 'pointer',
};

export default TransactionsPage;

