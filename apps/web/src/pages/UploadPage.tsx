import { FormEvent, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';

const UploadPage = () => {
  const { ingestPdf, triggerPlaidLink, state } = useFinancialData();
  const [uploading, setUploading] = useState(false);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get('statement') as File | null;

    if (!file) {
      setMessage('Please select a PDF statement to ingest.');
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      await ingestPdf(file);
      setMessage('Statement ingested successfully. Navigate to Insights to review the updated dashboard.');
      event.currentTarget.reset();
    } catch (error) {
      console.error(error);
      setMessage('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handlePlaid = async () => {
    setPlaidLoading(true);
    setMessage(null);
    try {
      await triggerPlaidLink();
      setMessage('Plaid connection established. Data refreshed.');
    } catch (error) {
      console.error(error);
      setMessage('Plaid link failed. Please retry.');
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

      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label>
          <strong>Upload PDF statement</strong>
          <input type="file" name="statement" accept="application/pdf" disabled={uploading} style={{ display: 'block', marginTop: 8 }} />
        </label>
        <button type="submit" disabled={uploading} style={buttonStyle}>
          {uploading ? 'Uploading...' : 'Ingest PDF'}
        </button>
      </form>

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

export default UploadPage;
