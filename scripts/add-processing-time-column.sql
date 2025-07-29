-- v3_keyword_ranking_checks 테이블에 processing_time 컬럼 추가
-- 키워드 중복 할당 방지를 위한 임시 락 역할

ALTER TABLE v3_keyword_ranking_checks 
ADD COLUMN IF NOT EXISTS processing_time TIME;

-- 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_v3_keyword_ranking_checks_processing_time 
ON v3_keyword_ranking_checks(processing_time);

-- 확인
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'v3_keyword_ranking_checks' 
AND column_name = 'processing_time';