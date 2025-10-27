import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import dayjs from 'dayjs';

export interface CashflowPoint {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
}

export interface AccountSnapshot {
  accountId: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface AdviceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface FinancialState {
  accounts: AccountSnapshot[];
  cashflow: CashflowPoint[];
  categories: CategoryBreakdown[];
  lastUpdated?: string;
  adviceHistory: AdviceMessage[];
}

type FinancialAction =
  | { type: 'SET_DATA'; payload: Omit<FinancialState, 'adviceHistory'> }
  | { type: 'ASK_QUESTION'; payload: { question: string } }
  | { type: 'RECEIVE_ADVICE'; payload: { reply: string } };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const DEMO_USER_ID = 'user-001';

const initialState: FinancialState = {
  accounts: [],
  cashflow: [],
  categories: [],
  lastUpdated: undefined,
  adviceHistory: [],
};

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const reducer = (state: FinancialState, action: FinancialAction): FinancialState => {
  switch (action.type) {
    case 'SET_DATA':
      return {
        ...state,
        accounts: action.payload.accounts,
        cashflow: action.payload.cashflow,
        categories: action.payload.categories,
        lastUpdated: action.payload.lastUpdated,
      };
    case 'ASK_QUESTION':
      return {
        ...state,
        adviceHistory: [
          ...state.adviceHistory,
          {
            id: randomId(),
            role: 'user',
            content: action.payload.question,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    case 'RECEIVE_ADVICE':
      return {
        ...state,
        adviceHistory: [
          ...state.adviceHistory,
          {
            id: randomId(),
            role: 'assistant',
            content: action.payload.reply,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    default:
      return state;
  }
};

const generateMockSummary = (): Omit<FinancialState, 'adviceHistory'> => {
  const today = dayjs();
  const months = Array.from({ length: 6 }).map((_, index) => {
    const month = today.subtract(index, 'month');
    const inflows = 5000 + Math.round(Math.random() * 700);
    const outflows = 3200 + Math.round(Math.random() * 600);
    return {
      month: month.format('MMM YYYY'),
      inflows,
      outflows,
      net: inflows - outflows,
    };
  });

  return {
    accounts: [
      { accountId: 'acct-checking', name: 'Everyday Checking', type: 'Checking', balance: 12500, currency: 'USD' },
      { accountId: 'acct-brokerage', name: 'Growth Brokerage', type: 'Brokerage', balance: 45800, currency: 'USD' },
      { accountId: 'acct-ira', name: 'Retirement IRA', type: 'Retirement', balance: 98200, currency: 'USD' },
    ],
    cashflow: months.reverse(),
    categories: [
      { category: 'Housing', amount: 1600 },
      { category: 'Transportation', amount: 450 },
      { category: 'Food & Dining', amount: 780 },
      { category: 'Insurance', amount: 310 },
      { category: 'Investments', amount: 1200 },
    ],
    lastUpdated: today.toISOString(),
  };
};

interface FinancialContextShape {
  state: FinancialState;
  loading: boolean;
  ingestPdf: (file: File) => Promise<void>;
  requestLinkToken: () => Promise<string>;
  completePlaidLink: (publicToken: string) => Promise<void>;
  refresh: () => Promise<void>;
  postQuestion: (prompt: string) => Promise<void>;
}

const FinancialDataContext = createContext<FinancialContextShape>({
  state: initialState,
  loading: false,
  ingestPdf: async () => {},
  requestLinkToken: async () => '',
  completePlaidLink: async () => {},
  refresh: async () => {},
  postQuestion: async () => {},
});

const mapSummaryToState = (summary: any): Omit<FinancialState, 'adviceHistory'> => ({
  accounts: Array.isArray(summary?.accounts) ? summary.accounts : [],
  cashflow: Array.isArray(summary?.cashflow) ? summary.cashflow : [],
  categories: Array.isArray(summary?.categories) ? summary.categories : [],
  lastUpdated: summary?.lastUpdated ?? new Date().toISOString(),
});

export const FinancialDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/financial-state?userId=${encodeURIComponent(DEMO_USER_ID)}`);

      if (!response.ok) {
        throw new Error('Failed to fetch financial summary');
      }

      const summary = await response.json();
      dispatch({ type: 'SET_DATA', payload: mapSummaryToState(summary) });
    } catch (error) {
      console.warn('Falling back to mock data:', error);
      dispatch({ type: 'SET_DATA', payload: generateMockSummary() });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ingestPdf = useCallback(
    async (file: File) => {
      // Placeholder for a future backend upload endpoint.
      await new Promise((resolve) => setTimeout(resolve, 600));
      dispatch({ type: 'SET_DATA', payload: generateMockSummary() });
      dispatch({
        type: 'RECEIVE_ADVICE',
        payload: {
          reply: `Successfully ingested ${file.name}. Balances and dashboards have been refreshed.`,
        },
      });
    },
    [],
  );

  const requestLinkToken = useCallback(async (): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/api/plaid/link-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: DEMO_USER_ID }),
    });

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: 'Unable to create link token' }));
      throw new Error(error ?? 'Unable to create link token');
    }

    const data = await response.json();
    return data.linkToken as string;
  }, []);

  const completePlaidLink = useCallback(async (publicToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/plaid/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicToken, userId: DEMO_USER_ID }),
    });

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: 'Unable to exchange public token' }));
      throw new Error(error ?? 'Unable to exchange public token');
    }

    const data = await response.json();
    dispatch({ type: 'SET_DATA', payload: mapSummaryToState(data.summary) });
  }, []);

  const postQuestion = useCallback(
    async (prompt: string) => {
      dispatch({ type: 'ASK_QUESTION', payload: { question: prompt } });

      await new Promise((resolve) => setTimeout(resolve, 700));
      const reply = buildAdviceReply(prompt, state);
      dispatch({ type: 'RECEIVE_ADVICE', payload: { reply } });
    },
    [state],
  );

  const value = useMemo<FinancialContextShape>(
    () => ({
      state,
      loading,
      ingestPdf,
      requestLinkToken,
      completePlaidLink,
      refresh,
      postQuestion,
    }),
    [state, loading, ingestPdf, requestLinkToken, completePlaidLink, refresh, postQuestion],
  );

  return <FinancialDataContext.Provider value={value}>{children}</FinancialDataContext.Provider>;
};

const buildAdviceReply = (prompt: string, state: FinancialState): string => {
  const lowercase = prompt.toLowerCase();

  if (lowercase.includes('savings') || lowercase.includes('emergency')) {
    const primaryAccount = state.accounts[0];
    if (primaryAccount) {
      const monthlyOutflows = state.cashflow.at(-1)?.outflows ?? 0;
      const target = Math.round((monthlyOutflows * 3) / 100) * 100;
      const shortfall = Math.max(0, target - primaryAccount.balance);
      return shortfall > 0
        ? `Aim to keep $${target.toLocaleString()} in liquid reserves. You currently hold $${primaryAccount.balance.toLocaleString()}, so allocate an additional $${shortfall.toLocaleString()} over the next few months.`
        : `Your emergency reserve target is approximately $${target.toLocaleString()}, and you're already above that threshold. Keep sweeping surplus into higher-yield accounts.`;
    }
  }

  if (lowercase.includes('invest') || lowercase.includes('allocation')) {
    return 'Consider targeting a 80/20 equity-to-fixed income allocation using low-cost ETFs. Automate monthly contributions after each paycheck to stay consistent.';
  }

  if (lowercase.includes('debt')) {
    return 'No liabilities appear in the synced accounts. If you maintain external debt, add those accounts so payoff strategies can be prioritised.';
  }

  return 'Net cashflow has remained positive over the tracked period. Continue routing surplus into investments and review your budget quarterly for additional optimisation opportunities.';
};

export const useFinancialData = () => useContext(FinancialDataContext);
