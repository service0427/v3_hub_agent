const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');

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

module.exports = {
  getAgentIP,
  getScreenName,
  getAgentName
};