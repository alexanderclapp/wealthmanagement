import { FormEvent, useEffect, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { usePlaidLink } from 'react-plaid-link';

const UploadPage = () => {
  const { ingestPdf, requestLinkToken, completePlaidLink, state } = useFinancialData();
  const [uploading, setUploading] = useState(false);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
