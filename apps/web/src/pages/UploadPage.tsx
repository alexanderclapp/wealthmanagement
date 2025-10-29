import { FormEvent, useEffect, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { usePlaidLink } from 'react-plaid-link';
import dayjs from 'dayjs';

// In production (Heroku), the backend API is served from the same origin
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:4000' : '');
const DEMO_USER_ID = 'user-001';

interface Statement {
  id: string;
  accountId: string;
  accountName: string;
  fileName?: string;
  ingestedAt: string;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  verificationStatus: string;
}

const UploadPage = () => {
  const { ingestPdf, requestLinkToken, completePlaidLink, state, refresh } = useFinancialData();
  const [uploading, setUploading] = useState(false);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStatements = async () => {
    setLoadingStatements(true);
    try {
      console.log('Fetching statements from:', `${API_BASE_URL}/api/statements?userId=${DEMO_USER_ID}`);
      const response = await fetch(`${API_BASE_URL}/api/statements?userId=${DEMO_USER_ID}`);
      console.log('Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Statements data:', data);
        setStatements(data.statements || []);
      } else {
        console.error('Failed to fetch statements, status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch statements:', error);
    } finally {
      setLoadingStatements(false);
    }
  };

  const handleDelete = async (statementId: string) => {
    if (!confirm('Are you sure you want to delete this statement? All associated transactions will be removed.')) {
      return;
    }

    setDeletingId(statementId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/statements/${statementId}?userId=${DEMO_USER_ID}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete statement');
      }

      setMessage('Statement deleted successfully');
      await fetchStatements();
      await refresh(); // Refresh financial data
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to delete statement');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file.type.includes('pdf')) {
      setMessage('Please upload a PDF file.');
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const result = await ingestPdf(file);
      const transactionCount = result?.transactionsProcessed ?? 0;
      setMessage(
        `Statement ingested successfully! Processed ${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}. Navigate to Insights to review the updated dashboard.`
      );
      await fetchStatements(); // Refresh statements list
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      setMessage(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handlePlaid = async () => {
    setPlaidLoading(true);
    setMessage(null);
    setPlaidError(null);
    try {
      const token = await requestLinkToken();
      setLinkToken(token);
    } catch (error) {
      console.error(error);
      setPlaidError(error instanceof Error ? error.message : 'Plaid link failed. Please retry.');
    } finally {
      setPlaidLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2>Upload & Sync Accounts</h2>
      <p>
        Import account statements or connect a live institution. Data remains local in this demo and feeds the analytics
        dashboards and advice assistant.
      </p>

      <div>
        <strong>Upload PDF statement</strong>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            ...dropZoneStyle,
            backgroundColor: dragActive ? '#eff6ff' : '#f9fafb',
            borderColor: dragActive ? '#2563eb' : '#d1d5db',
          }}
        >
          <input
            type="file"
            id="pdf-upload"
            accept="application/pdf"
            onChange={handleFileInput}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <label htmlFor="pdf-upload" style={{ cursor: uploading ? 'not-allowed' : 'pointer', width: '100%', textAlign: 'center' }}>
            {uploading ? (
              <p style={{ margin: 0, color: '#6b7280' }}>Uploading...</p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600 }}>📄 Drop PDF here or click to browse</p>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
                  Drag and drop your bank statement PDF file here
                </p>
              </>
            )}
          </label>
        </div>
      </div>

      <div style={{ margin: '32px 0', borderTop: '1px solid #e5e7eb' }} />

      <section>
        <strong>Bank & investment aggregation</strong>
        <p style={{ marginTop: 8, marginBottom: 16 }}>
          Use Plaid to keep balances and transactions in sync. In this sandbox it generates representative data.
        </p>
        <button onClick={handlePlaid} disabled={plaidLoading} style={buttonStyle}>
          {plaidLoading ? 'Linking...' : 'Connect with Plaid'}
        </button>
      </section>

      {state.lastUpdated && (
        <p style={{ marginTop: 24, fontSize: '0.9rem', color: '#4b5563' }}>
          Last data refresh: {new Date(state.lastUpdated).toLocaleString()}
        </p>
      )}

      {message && (
        <div className="chip" style={{ marginTop: 24, background: '#d1fae5', color: '#047857' }}>
          {message}
        </div>
      )}

      {plaidError && (
        <div className="chip" style={{ marginTop: 16, background: '#fee2e2', color: '#b91c1c' }}>
          {plaidError}
        </div>
      )}

      {(statements.length > 0 || loadingStatements) && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ marginBottom: 16 }}>
            📂 Uploaded Statements {loadingStatements ? '(Loading...)' : `(${statements.length})`}
          </h3>
          {loadingStatements && statements.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Loading your statements...</p>
          ) : statements.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No statements uploaded yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Period</th>
                  <th>Transactions</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((stmt) => (
                  <tr key={stmt.id}>
                    <td>{stmt.fileName || 'Unknown'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {dayjs(stmt.periodStart).format('MMM D')} - {dayjs(stmt.periodEnd).format('MMM D, YYYY')}
                    </td>
                    <td>{stmt.transactionCount}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dayjs(stmt.ingestedAt).format('MMM D, YYYY h:mm A')}</td>
                    <td>
                      <span
                        className="chip"
                        style={{
                          fontSize: '0.75rem',
                          background:
                            stmt.verificationStatus === 'PASS'
                              ? '#d1fae5'
                              : stmt.verificationStatus === 'REVIEW'
                              ? '#fef3c7'
                              : '#fee2e2',
                          color:
                            stmt.verificationStatus === 'PASS'
                              ? '#047857'
                              : stmt.verificationStatus === 'REVIEW'
                              ? '#92400e'
                              : '#b91c1c',
                        }}
                      >
                        {stmt.verificationStatus}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(stmt.id)}
                        disabled={deletingId === stmt.id}
                        style={{
                          ...deleteButtonStyle,
                          opacity: deletingId === stmt.id ? 0.5 : 1,
                          cursor: deletingId === stmt.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {deletingId === stmt.id ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {linkToken && (
        <PlaidLinkLauncher
          token={linkToken}
          onSuccess={async (publicToken) => {
            try {
              await completePlaidLink(publicToken);
              setPlaidError(null);
              setMessage('Plaid connection established. Data refreshed.');
            } catch (error) {
              const err = error instanceof Error ? error.message : 'Plaid link failed. Please retry.';
              setPlaidError(err);
            } finally {
              setLinkToken(null);
            }
          }}
          onExit={() => {
            setLinkToken(null);
          }}
        />
      )}
    </div>
  );
};

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

const deleteButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  background: '#fee2e2',
  border: '1px solid #fca5a5',
  color: '#b91c1c',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.85rem',
  transition: 'all 0.2s ease',
};

const dropZoneStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '48px 24px',
  border: '2px dashed #d1d5db',
  borderRadius: 12,
  textAlign: 'center',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
};

export default UploadPage;

const PlaidLinkLauncher = ({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: (publicToken: string) => Promise<void>;
  onExit: () => void;
}) => {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      await onSuccess(publicToken);
    },
    onExit,
  });

  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);

  return null;
};
