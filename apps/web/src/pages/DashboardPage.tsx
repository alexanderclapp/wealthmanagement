import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialData } from '../context/FinancialDataContext';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const palette = ['#2563eb', '#14b8a6', '#f97316', '#facc15', '#8b5cf6'];

const DashboardPage = () => {
  const { state } = useFinancialData();
  const navigate = useNavigate();

  const totals = useMemo(() => {
    if (state.accounts.length === 0) {
      return null;
    }
    const totalAssets = state.accounts.reduce((sum, account) => sum + account.balance, 0);
    const latestCashflow = state.cashflow.at(-1);
    const avgNet = state.cashflow.reduce((sum, point) => sum + point.net, 0) / (state.cashflow.length || 1);

    return {
      totalAssets,
      netMonthly: latestCashflow?.net ?? 0,
      averageNet: avgNet,
    };
  }, [state.accounts, state.cashflow]);

  if (!totals) {
    return (
      <div className="card">
        <h2>No financial data yet</h2>
        <p>Upload a statement or connect to Plaid to populate the dashboard.</p>
        <button onClick={() => navigate('/')} style={buttonStyle}>
          Go to Uploads
        </button>
      </div>
    );
  }

  return (
    <div className="two-column">
      <section className="card">
        <h2>Financial Snapshot</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Metric label="Total assets" value={formatCurrency(totals.totalAssets)} />
          <Metric label="Latest net cashflow" value={formatCurrency(totals.netMonthly)} trend={totals.netMonthly >= 0 ? 'up' : 'down'} />
          <Metric label="Avg net cashflow (6m)" value={formatCurrency(totals.averageNet)} />
        </div>

        <div style={{ height: 260, marginTop: 32 }}>
          <ResponsiveContainer>
            <AreaChart data={state.cashflow}>
              <defs>
                <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" dataKey="inflows" stroke="#22c55e" fillOpacity={0.1} fill="#22c55e" />
              <Area type="monotone" dataKey="outflows" stroke="#ef4444" fillOpacity={0.1} fill="#ef4444" />
              <Area type="monotone" dataKey="net" stroke="#2563eb" fill="url(#colorNet)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <h2>Account Balances</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Balance</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {state.accounts.map((account) => (
              <tr key={account.accountId}>
                <td>{account.name}</td>
                <td>{account.type}</td>
                <td>{formatCurrency(account.balance)}</td>
                <td>{account.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ height: 240, marginTop: 24 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie dataKey="amount" nameKey="category" data={state.categories} outerRadius={100} label>
                {state.categories.map((entry, index) => (
                  <Cell key={entry.category} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

const Metric = ({ label, value, trend }: { label: string; value: string; trend?: 'up' | 'down' }) => (
  <div style={{ minWidth: 180 }}>
    <p style={{ margin: '0 0 8px 0', color: '#6b7280' }}>{label}</p>
    <strong style={{ fontSize: '1.5rem' }}>{value}</strong>
    {trend && (
      <span className="chip" style={{ marginLeft: 8 }}>
        {trend === 'up' ? '▲ Positive' : '▼ Negative'}
      </span>
    )}
  </div>
);

const formatCurrency = (input: number) =>
  input.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const buttonStyle: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 10,
  background: '#2563eb',
  border: 'none',
  color: '#f9fafb',
  fontWeight: 600,
  cursor: 'pointer',
  width: 'fit-content',
};

export default DashboardPage;
