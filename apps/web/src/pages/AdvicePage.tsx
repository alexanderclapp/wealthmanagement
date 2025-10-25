import { FormEvent, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';

const AdvicePage = () => {
  const { state, postQuestion } = useFinancialData();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }

    setLoading(true);
    try {
      await postQuestion(question.trim());
      setQuestion('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 840 }}>
      <h2>Advice Assistant</h2>
      <p>
        Ask personalised questions about cashflow, savings targets, or investment strategy. Responses combine uploaded
        data with rule-based recommendations inside this prototype.
      </p>

      <div className="chat-container">
        <section className="chat-history">
          {state.adviceHistory.length === 0 && (
            <div style={{ color: '#6b7280' }}>No questions yet. Start a conversation using the form below.</div>
          )}
          {state.adviceHistory.map((message) => (
            <article key={message.id} className={`chat-bubble ${message.role === 'user' ? 'user' : ''}`}>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {message.role === 'user' ? 'You' : 'Advisor'} · {new Date(message.createdAt).toLocaleTimeString()}
              </div>
              <div>{message.content}</div>
            </article>
          ))}
        </section>

        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="e.g., How much should I keep in my emergency fund?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdvicePage;
