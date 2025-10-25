import { AdviceContextDTO } from '../dto/AdviceContextDTO.js';
import { AdviceRecommendationDTO } from '../dto/AdviceRecommendationDTO.js';

export interface AdviceEnginePort {
  generateAdvice(context: AdviceContextDTO): Promise<AdviceRecommendationDTO[]>;
}
