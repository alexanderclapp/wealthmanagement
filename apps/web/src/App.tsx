import { NavLink, Route, Routes } from 'react-router-dom';
import { FinancialDataProvider } from './context/FinancialDataContext';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AdvicePage from './pages/AdvicePage';

const App = () => {
  return (
    <FinancialDataProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <h1>Wealth Portal</h1>
          <nav>
            <NavLink to="/" end>
              Upload & Sync
            </NavLink>
            <NavLink to="/dashboard">Insights</NavLink>
            <NavLink to="/transactions">Transactions</NavLink>
            <NavLink to="/advice">Advice</NavLink>
          </nav>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/advice" element={<AdvicePage />} />
          </Routes>
        </main>
      </div>
    </FinancialDataProvider>
  );
};

export default App;
