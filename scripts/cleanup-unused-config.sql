-- v3_agent_config 테이블에서 더 이상 사용하지 않는 설정들 정리
-- 이 설정들은 하드코딩되었거나 사용되지 않음

-- 1. headless 설정 제거 (항상 false로 하드코딩됨)
DELETE FROM v3_agent_config WHERE config_key = 'headless';

-- 2. 사용하지 않는 브라우저 관련 설정 제거
DELETE FROM v3_agent_config WHERE config_key IN (
    'window_width',           -- 브라우저 기본값 사용
    'window_height',          -- 브라우저 기본값 사용
    'browser_rotate_enabled', -- 브라우저 로테이션 기능 사용 안함
    'default_timeout'         -- 브라우저 내부 설정 사용
);

-- 3. IP 로테이션 관련 설정 제거 (사용 안함)
DELETE FROM v3_agent_config WHERE config_key = 'auto_ip_rotate_threshold';

-- 현재 남아있는 설정 확인
SELECT config_key, config_value, description 
FROM v3_agent_config 
ORDER BY config_key;