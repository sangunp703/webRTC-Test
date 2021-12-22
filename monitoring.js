const puppeteer = require('puppeteer');
const io = require('socket.io-client');
const SOCKET_SERVER_URL = 'http://localhost:23000';
const socketRef = io(SOCKET_SERVER_URL);
const DEVICE_ID = process.env.DEVICE_ID;

let isRunning = false;
let browser;
let interval = setInterval(function () {
  socketRef.emit('checkRoom', {
    room: DEVICE_ID
  });
}, 2000);

socketRef.on('validRoom', () => {
  console.log('valid');
  if (!isRunning) {
    isRunning = true;
    start();
  }
});

socketRef.on('invalidRoom', async () => {
  console.log('invalid');
  isRunning = false;
  if (browser) await browser.close();
  if (!interval) {
    interval = setInterval(function () {
      socketRef.emit('checkRoom', {
        room: DEVICE_ID
      });
    }, 2000);
  }
});

async function start() {
  let browser = await initialize();
  await startExplore(browser);
}

// 가상 브라우저 생성
async function initialize() {
  browser = await puppeteer.launch({
    defaultViewport: {
      width: 1920,
      height: 1280
    },
    headless: true,
    args: ['--disable-web-security', '--use-fake-ui-for-media-stream']
  });
  let context = browser.defaultBrowserContext();
  await context.overridePermissions('http://localhost:23000', [
    'camera',
    'microphone'
  ]);

  return browser;
}

async function startExplore(browser) {
  const page = await browser.newPage();
  await page.bringToFront();
  page.setExtraHTTPHeaders({
    'Accept-Charset': 'utf-8',
    'Content-Type': 'application/json; charset=utf-8'
  });
  await page.goto(`http://localhost:23000/${DEVICE_ID}`);
}
