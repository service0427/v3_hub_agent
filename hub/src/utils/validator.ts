import Joi from 'joi';
import { CoupangSearchRequest } from '../types';

// 쿠팡 API 요청 검증 스키마
export const coupangSearchSchema = Joi.object<CoupangSearchRequest>({
  keyword: Joi.string().min(1).max(500).required()
    .messages({
      'string.empty': '키워드는 필수입니다',
      'string.max': '키워드는 500자를 초과할 수 없습니다',
    }),
  code: Joi.string().min(1).max(255).required()
    .messages({
      'string.empty': '제품 코드는 필수입니다',
      'string.max': '제품 코드는 255자를 초과할 수 없습니다',
    }),
  pages: Joi.number().integer().min(1).max(10).default(1)
    .messages({
      'number.min': '페이지 수는 1 이상이어야 합니다',
      'number.max': '페이지 수는 10을 초과할 수 없습니다',
    }),
  key: Joi.string().required()
    .messages({
      'string.empty': 'API 키는 필수입니다',
    }),
  browser: Joi.string().valid('chrome', 'firefox', 'edge', 'auto').default('auto')
    .messages({
      'any.only': '브라우저는 chrome, firefox, edge, auto 중 하나여야 합니다',
    }),
});

// 검증 함수
export function validateCoupangSearchRequest(data: any): {
  error?: string;
  value?: CoupangSearchRequest;
} {
  const { error, value } = coupangSearchSchema.validate(data);
  
  if (error) {
    return { error: error.details[0].message };
  }
  
  return { value };
}