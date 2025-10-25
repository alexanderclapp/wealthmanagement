import React, { createContext, useContext, useMemo, useReducer } from 'react';
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
  | { type: 'INGEST_PDF'; payload: { fileName: string; size: number } }
  | { type: 'LINK_PLAID'; payload: { institution: string } }
  | { type: 'ASK_QUESTION'; payload: { question: string } }
  | { type: 'RECEIVE_ADVICE'; payload: { reply: string } };

const initialState: FinancialState = {
  accounts: [],
  cashflow: [],
  categories: [],
  adviceHistory: [],
};

const FinancialDataContext = createContext<{
  state: FinancialState;
  ingestPdf: (file: File) => Promise<void>;
  triggerPlaidLink: () => Promise<void>;
  postQuestion: (prompt: string) => Promise<void>;
}>({
  state: initialState,
  ingestPdf: async () => {},
  triggerPlaidLink: async () => {},
  postQuestion: async () => {},
});

const generateMockData = (): Omit<FinancialState, 'adviceHistory'> => {
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

  const accounts: AccountSnapshot[] = [
    {
      accountId: 'acct-checking',
      name: 'Everyday Checking',
      type: 'Checking',
      balance: 12500,
      currency: 'USD',
    },
    {
      accountId: 'acct-brokerage',
      name: 'Growth Brokerage',
      type: 'Brokerage',
      balance: 45800,
      currency: 'USD',
    },
    {
      accountId: 'acct-ira',
      name: 'Retirement IRA',
      type: 'Retirement',
      balance: 98200,
      currency: 'USD',
    },
  ];

  const categories: CategoryBreakdown[] = [
    { category: 'Housing', amount: 1600 },
    { category: 'Transportation', amount: 450 },
    { category: 'Food & Dining', amount: 780 },
    { category: 'Insurance', amount: 310 },
    { category: 'Investments', amount: 1200 },
  ];

  return {
    accounts,
    cashflow: months.reverse(),
    categories,
    lastUpdated: today.toISOString(),
  };
};

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const reducer = (state: FinancialState, action: FinancialAction): FinancialState => {
  switch (action.type) {
    case 'INGEST_PDF': {
      const mockData = generateMockData();

      return {
        ...state,
        ...mockData,
        adviceHistory: [
          ...state.adviceHistory,
          {
            id: randomId(),
            role: 'assistant',
            content: `Successfully ingested ${action.payload.fileName}. Balances and cashflow have been refreshed.`,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    case 'LINK_PLAID': {
      const mockData = generateMockData();
      return {
        ...state,
        ...mockData,
        adviceHistory: [
          ...state.adviceHistory,
          {
            id: randomId(),
            role: 'assistant',
            content: `Plaid connection established with ${action.payload.institution}. Dashboard synced.`,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    case 'ASK_QUESTION': {
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
    }
    case 'RECEIVE_ADVICE': {
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
    }
    default:
      return state;
  }
};

export const FinancialDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const contextValue = useMemo(
    () => ({
      state,
      ingestPdf: async (file: File) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        dispatch({ type: 'INGEST_PDF', payload: { fileName: file.name, size: file.size } });
      },
      triggerPlaidLink: async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        dispatch({ type: 'LINK_PLAID', payload: { institution: 'Plaid Sandbox Bank' } });
      },
      postQuestion: async (prompt: string) => {
        dispatch({ type: 'ASK_QUESTION', payload: { question: prompt } });

        await new Promise((resolve) => setTimeout(resolve, 700));
        const reply = buildAdviceReply(prompt, state);
        dispatch({ type: 'RECEIVE_ADVICE', payload: { reply } });
      },
    }),
    [state],
  );

  return <FinancialDataContext.Provider value={contextValue}>{children}</FinancialDataContext.Provider>;
};

const buildAdviceReply = (prompt: string, state: FinancialState): string => {
  const lowercase = prompt.toLowerCase();

  if (lowercase.includes('savings') || lowercase.includes('emergency')) {
    const checking = state.accounts.find((account) => account.accountId === 'acct-checking');
    if (checking) {
      const runRate = state.cashflow.at(-1)?.outflows ?? 0;
      const target = Math.round((runRate * 3) / 100) * 100;
      return `Aim to keep at least $${target.toLocaleString()} in liquid reserves. Your current checking balance is $${checking.balance.toLocaleString()}, leaving a shortfall of $${Math.max(
        0,
        target - checking.balance,
      ).toLocaleString()}. Consider redirecting surplus cashflow over the next few months.`;
    }
  }

  if (lowercase.includes('invest') || lowercase.includes('asset allocation')) {
    return 'Based on your cashflow surplus, consider allocating 20% towards low-cost equity index funds and 5% towards bonds to maintain diversification. Rebalance quarterly.';
  }

  if (lowercase.includes('debt')) {
    return 'No outstanding liabilities were detected in the synced accounts. If you hold external debt, add those accounts to improve payoff strategies.';
  }

  return 'Review your monthly cashflow: net inflows remain positive over the last 6 months. Continue automating transfers after each paycheck to stay on track with long-term goals.';
};

export const useFinancialData = () => useContext(FinancialDataContext);
