const os = require('os');

function getLocalIp() {
  const nets = os.networkInterfaces();
  const preferred = ['wi-fi', 'wifi', 'ethernet', 'eth', 'wlan', 'lan'];

  // 1. Try preferred physical network interfaces (Wi-Fi, Ethernet)
  for (const pref of preferred) {
    for (const name of Object.keys(nets)) {
      const lower = name.toLowerCase();
      if (lower.includes(pref) && !lower.includes('vethernet')) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
            return net.address;
          }
        }
      }
    }
  }

  // 2. Try any non-virtual, non-internal IPv4
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (!lower.includes('vethernet') && !lower.includes('virtual') && !lower.includes('loopback') && !lower.includes('wsl')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          return net.address;
        }
      }
    }
  }

  // 3. Fallback to any non-internal IPv4
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return 'localhost';
}

if (require.main === module) {
  process.stdout.write(getLocalIp());
}

module.exports = { getLocalIp };
