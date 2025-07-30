const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;

// IP 주소 가져오기 (간결하게)
async function getAgentIP() {
  // Windows 감지
  const isWindows = process.platform === 'win32';
  
  try {
    if (isWindows) {
      // Windows: ipconfig 사용
      const { stdout } = await execAsync('ipconfig | findstr /i "IPv4" | findstr /v "127.0.0.1"');
      const match = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) return match[1];
    } else {
      // Linux/macOS: ip 명령어 사용
      const { stdout } = await execAsync('ip a 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk \'{print $2}\' | cut -d/ -f1');
      const localIP = stdout.trim();
      if (localIP) return localIP;
    }
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
  const isWindows = process.platform === 'win32';
  
  try {
    const hostname = await getAgentName();
    
    if (isWindows) {
      // Windows: MAC 주소 또는 BIOS 시리얼 번호 사용
      try {
        // MAC 주소 시도
        const { stdout } = await execAsync('ipconfig /all | findstr /i "Physical Address" | findstr /v "00-00-00"');
        const match = stdout.match(/([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}/);
        if (match) {
          const mac = match[0].replace(/-/g, '').substring(6).toUpperCase();
          return `${hostname}-${mac}`;
        }
      } catch (e) {}
      
      try {
        // BIOS 시리얼 번호 시도
        const { stdout } = await execAsync('wmic bios get serialnumber /value');
        const match = stdout.match(/SerialNumber=(.+)/);
        if (match && match[1].trim()) {
          const serial = match[1].trim().substring(0, 6);
          return `${hostname}-${serial}`;
        }
      } catch (e) {}
    } else {
      // Linux/macOS
      // 1. Machine ID 시도 (Linux)
      try {
        const machineId = await fs.readFile('/etc/machine-id', 'utf8');
        if (machineId && machineId.trim()) {
          return `${hostname}-${machineId.trim().substring(0, 8)}`;
        }
      } catch (e) {}
      
      // 2. MAC 주소 시도
      try {
        const { stdout } = await execAsync("ip link show 2>/dev/null | grep -E '^[0-9]+: e|^[0-9]+: w' | head -1 | awk '{print $2}' | tr -d ':'");
        const interfaceName = stdout.trim();
        
        if (interfaceName) {
          const { stdout: macStdout } = await execAsync(`cat /sys/class/net/${interfaceName}/address 2>/dev/null || ip link show ${interfaceName} 2>/dev/null | grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' | head -1`);
          const mac = macStdout.trim().replace(/:/g, '');
          
          if (mac && mac !== '000000000000') {
            return `${hostname}-${mac.substring(mac.length - 6).toUpperCase()}`;
          }
        }
      } catch (e) {}
    }
    
    // 3. 폴백: hostname + 짧은 해시
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