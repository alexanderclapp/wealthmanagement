import { AdviceContextDTO } from '../dto/AdviceContextDTO.js';
import { AdviceRecommendationDTO } from '../dto/AdviceRecommendationDTO.js';

export interface QuestionAnswerRequest {
  question: string;
  context: AdviceContextDTO;
  recentTransactions?: Array<{
    date: string;
    description: string;
    amount: number;
    category?: string;
  }>;
  categoryBreakdown?: Array<{
    category: string;
    total: number;
    percentage: number;
  }>;
}

export interface AdviceEnginePort {
  generateAdvice(context: AdviceContextDTO): Promise<AdviceRecommendationDTO[]>;
  answerQuestion(request: QuestionAnswerRequest): Promise<string>;
}
