const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;

// IP 주소 가져오기 (간결하게)
async function getAgentIP() {
  try {
    const { stdout } = await execAsync('ip a | grep "inet " | grep -v "127.0.0.1" | head -1 | awk \'{print $2}\' | cut -d/ -f1');
    const localIP = stdout.trim();
    if (localIP) return localIP;
  } catch (error) {}
  
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    return response.data.ip;
  } catch (error) {
    return 'unknown';
  }
}

// Screen 이름 가져오기
async function getScreenName() {
  try {
    // STY 환경변수로 screen 세션 확인
    if (process.env.STY) {
      return process.env.STY.split('.').slice(1).join('.');
    }
    
    // screen -ls로 현재 attached 세션 확인
    const { stdout } = await execAsync('screen -ls | grep Attached | head -1 | awk \'{print $1}\' | cut -d. -f2-');
    const screenName = stdout.trim();
    if (screenName) return screenName;
    
    return 'no-screen';
  } catch (error) {
    return 'no-screen';
  }
}

// 호스트명/에이전트명 가져오기
async function getAgentName() {
  try {
    const { stdout } = await execAsync('hostname');
    return stdout.trim() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// 고유한 에이전트 ID 생성
async function getUniqueAgentId() {
  try {
    // 1. Machine ID 시도 (Linux)
    try {
      const machineId = await fs.readFile('/etc/machine-id', 'utf8');
      if (machineId && machineId.trim()) {
        const hostname = await getAgentName();
        return `${hostname}-${machineId.trim().substring(0, 8)}`;
      }
    } catch (e) {}
    
    // 2. MAC 주소 시도
    try {
      // 첫 번째 물리적 네트워크 인터페이스의 MAC 주소 가져오기
      const { stdout } = await execAsync("ip link show | grep -E '^[0-9]+: e|^[0-9]+: w' | head -1 | awk '{print $2}' | tr -d ':'");
      const interfaceName = stdout.trim();
      
      if (interfaceName) {
        const { stdout: macStdout } = await execAsync(`cat /sys/class/net/${interfaceName}/address 2>/dev/null || ip link show ${interfaceName} | grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' | head -1`);
        const mac = macStdout.trim().replace(/:/g, '');
        
        if (mac && mac !== '000000000000') {
          const hostname = await getAgentName();
          // MAC 주소의 마지막 6자리 사용
          return `${hostname}-${mac.substring(mac.length - 6).toUpperCase()}`;
        }
      }
    } catch (e) {}
    
    // 3. 폴백: hostname + 짧은 해시
    const hostname = await getAgentName();
    const hash = crypto.createHash('md5').update(hostname + process.pid).digest('hex').substring(0, 6);
    return `${hostname}-${hash}`;
    
  } catch (error) {
    // 4. 최종 폴백
    return `agent-${Date.now()}`;
  }
}

module.exports = {
  getAgentIP,
  getScreenName,
  getAgentName,
  getUniqueAgentId
};