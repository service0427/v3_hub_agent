// Common type definitions for ParserHub V3

// Browser types
export type BrowserType = 'chrome' | 'firefox' | 'firefox-nightly' | 'edge';

// API Request types
export interface CoupangSearchRequest {
  keyword: string;
  code: string;
  pages?: number;
  key: string;
  browser?: BrowserType | 'auto';
  host?: string;  // 형식: "ip:port" (예: "192.168.1.100:3301")
}

// API Response types
export interface CoupangSearchResponse {
  success: boolean;
  data?: {
    platform: 'coupang';
    keyword: string;
    code: string;
    rank: number | null;
    realRank: number | null;
    product?: {
      name: string;
      price: number;
      thumbnail: string;
      rating: string;
      reviewCount: number;
    };
    browser: BrowserType;
    agentInfo?: {
      vmId: string;
      browserVersion: string;
    };
  };
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
  executionTime: number;
}

// Agent types
export interface Agent {
  id: string;
  vmId: string;
  browser: BrowserType;
  browserVersion: string;
  status: 'idle' | 'busy' | 'error' | 'disconnected';
  lastActivity: Date;
  connectedAt: Date;
  tasksCompleted: number;
  tasksInProgress: number;
  remoteAddress?: string;  // 에이전트 접속 IP
  port?: number;           // 에이전트 포트
}

// Task types
export interface SearchTask {
  id: string;
  apiKey: string;
  keyword: string;
  productCode: string;
  pages: number;
  browser: BrowserType;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  agentId?: string;
  result?: any;
  error?: string;
}

// Database model types
export interface ApiKey {
  id: number;
  api_key: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface BillingUsage {
  id: number;
  api_key: string;
  keyword: string;
  product_code: string;
  date: Date;
  first_request_at: Date;
  last_request_at: Date;
  request_count: number;
  billing_amount: number;
  success_count: number;
  error_count: number;
}

export interface RankingHistory {
  id: number;
  api_key: string;
  keyword: string;
  product_code: string;
  rank?: number;
  real_rank?: number;
  product_name?: string;
  price?: number;
  thumbnail_url?: string;
  rating?: string;
  review_count?: number;
  pages_searched: number;
  browser_type: BrowserType;
  vm_id?: string;
  browser_version?: string;
  execution_time_ms?: number;
  success: boolean;
  error_message?: string;
  created_at: Date;
}

// Error types
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Validation schemas types (for Joi)
export interface ValidationError {
  field: string;
  message: string;
}