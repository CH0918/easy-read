import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

let context: BrowserContext;
let server: Server;
let extensionId: string;
let options: Page;
let article: Page;
let origin: string;
const requests: {
  model: string;
  messages: { role: string; content: string }[];
  reasoning_effort?: string;
}[] = [];
const errors: string[] = [];
let streamingParagraphs: string[] | undefined;
const fixture = `<!doctype html><html><head><title>The Art of Reading — Margin test</title><style>
body{margin:0;color:#394333;background:#fcfcf7;font:18px/1.9 Georgia,serif}main{max-width:760px;margin:80px auto;padding:0 35px}h1{font-size:44px;font-weight:400;line-height:1.2}h2{font-size:22px}p{margin:25px 0}small{letter-spacing:3px;font:11px sans-serif;color:#899477}header,footer{display:none}input{padding:10px}button{background:red!important;border:12px solid red!important;color:red!important}textarea{font:40px serif!important}.long{margin-top:1200px}
</style></head><body><main><small>THE READING ROOM · LANGUAGE & LIFE</small><h1>The art of reading<br>between the lines.</h1><p>Words carry more than their dictionary definitions. A thoughtful reader pays attention to the context, the tone, and what remains unsaid.</p><p id="passage">To truly understand a story, you sometimes need to <span id="target">read between the lines</span>.</p><p id="followup">It is about finding meaning beyond the words on the page.</p><form><label>Private notes <input value="SECRET_FORM_VALUE"></label><textarea>SECRET_TEXTAREA</textarea></form><div hidden>SECRET_HIDDEN</div><p class="long">OFFSCREEN_TEXT_MUST_NOT_BE_SENT</p></main></body></html>`;

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [{ id: 'margin-test' }, { id: 'slow-model' }, { id: 'invalid-model' }],
        }),
      );
      return;
    }
    if (req.url === '/v1/chat/completions') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      if (body.model === 'invalid-model') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end('{"error":{"message":"invalid key"}}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const answer = body.messages.some(
        (m: { content: string }) => m.content === 'Reply with only OK.',
      )
        ? 'OK'
        : body.messages.filter((m: { role: string }) => m.role === 'user').length > 2
          ? '例如：**Her smile said yes, but reading between the lines, she was unsure.** 她虽然微笑着答应，实际上仍有犹豫。'
          : '**read between the lines** 在这里是「读懂字里行间的意思」。\n\n作者说，理解故事不只看字面，还要结合语气和上下文，体会没有直接说出来的意思。';
      const paragraphs = streamingParagraphs;
      for (const word of paragraphs ?? answer.match(/.{1,8}|\n/g) ?? []) {
        if (res.destroyed) return;
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\r\n\r\n`);
        await new Promise((resolve) =>
          setTimeout(resolve, paragraphs ? 100 : body.model === 'slow-model' ? 450 : 20),
        );
      }
      res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fixture);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  origin = `http://127.0.0.1:${address.port}`;
  const extensionPath = path.resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await mkdir('docs/screenshots', { recursive: true });
});

test.afterAll(async () => {
  await context?.close();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function selectPhrase(page: Page, modifier = 'Space') {
  await expect(async () => {
    await page.locator('#target').evaluate((element) => {
      const selection = getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press(modifier);
    await expect(page.getByRole('dialog', { name: 'Margin 页边阅读助手' })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10000 });
}

test.describe.serial('installed Chrome extension', () => {
  test('connection input survives provider changes, incomplete edits, and closing the popup', async () => {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    let popup = await context.newPage();
    await popup.goto(popupUrl);
    await popup.getByLabel('AI 服务商').selectOption('custom');
    await expect(popup.getByLabel('思考强度', { exact: true })).toHaveValue('default');
    await popup.getByLabel('思考强度', { exact: true }).selectOption('high');
    await popup.getByLabel('Base URL', { exact: true }).fill(`${origin}/v1`);
    await popup.getByLabel(/^API Key/).fill('draft-test-key');
    await popup.getByLabel('AI 服务商').selectOption('deepseek');
    await expect(popup.getByLabel('Base URL', { exact: true })).toHaveValue(`${origin}/v1`);
    await expect(popup.getByLabel(/^API Key/)).toHaveValue('draft-test-key');
    await popup.getByLabel('Base URL', { exact: true }).fill('http://');
    await expect(popup.getByLabel(/^API Key/)).toHaveValue('draft-test-key');
    // Close immediately after input, without waiting for a debounce, blur handler, or Save.
    await popup.getByLabel(/^API Key/).fill('latest-draft-key');
    await popup.close();
    popup = await context.newPage();
    await popup.goto(popupUrl);
    await expect(popup.getByLabel('Base URL', { exact: true })).toHaveValue('http://');
    await expect(popup.getByLabel('思考强度', { exact: true })).toHaveValue('high');
    await expect(popup.getByLabel(/^API Key/)).toHaveValue('latest-draft-key');
    await popup.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(popup.getByText('请输入完整的 Base URL', { exact: false })).toBeVisible();
    await popup.close();

    await options.reload();
    await expect(options.getByLabel('Base URL', { exact: true })).toHaveValue('http://');
    await expect(options.getByLabel(/^API Key/)).toHaveValue('latest-draft-key');
    await options.getByRole('button', { name: '阅读偏好', exact: true }).click();
    await options.getByLabel('解释详细程度', { exact: true }).selectOption('detailed');
    await options.getByRole('button', { name: 'AI 连接', exact: true }).click();
    await expect(options.getByLabel(/^API Key/)).toHaveValue('latest-draft-key');
    const unapplied = await options.evaluate(async () => ({
      remote: await chrome.storage.sync.get(null),
      public: await chrome.runtime.sendMessage({ type: 'settings:get' }),
    }));
    expect(unapplied.public.data.configured).toBe(false);
    expect(JSON.stringify(unapplied.remote)).not.toContain('latest-draft-key');
    await options.getByLabel('Base URL', { exact: true }).fill(`${origin}/v1/`);
    await expect(options.getByLabel(/^API Key/)).toHaveValue('latest-draft-key');
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(options.getByText('设置已保存，开始阅读吧。')).toBeVisible();
    expect(await options.evaluate(async () => chrome.storage.local.get('margin.draft.v1'))).toEqual(
      {},
    );
    popup = await context.newPage();
    await popup.goto(popupUrl);
    await expect(popup.getByLabel('Base URL', { exact: true })).toHaveValue(`${origin}/v1`);
    await expect(popup.getByLabel(/^API Key/)).toHaveValue('latest-draft-key');
    await popup.close();
    // Restore a clean setup for the existing first-run tests without touching a personal profile.
    await options.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
    });
    await options.reload();
  });

  test('settings, automatic model discovery, connection test, and secret isolation', async () => {
    await expect(options.getByRole('heading', { name: '好奇，不必止于语言。' })).toBeVisible();
    await options.screenshot({ path: 'docs/screenshots/settings.png', fullPage: true });
    await options.getByLabel('AI 服务商').selectOption('custom');
    await options.getByLabel('Base URL', { exact: true }).fill(`${origin}/v1`);
    await options.getByLabel(/^API Key/).fill('margin-test-key');
    await expect(options.getByText('已发现 3 个模型。', { exact: false })).toBeVisible();
    await options.getByRole('button', { name: '选择模型', exact: true }).click();
    await options.getByLabel('搜索模型').fill('margin');
    await options.getByRole('button', { name: 'margin-test', exact: true }).click();
    await options.getByLabel('思考强度', { exact: true }).selectOption('low');
    await options.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(options.getByText('连接成功', { exact: false })).toBeVisible();
    expect(requests.at(-1)?.reasoning_effort).toBe('low');
    await options.getByLabel('思考强度', { exact: true }).selectOption('none');
    await expect(options.getByText('连接成功', { exact: false })).toHaveCount(0);
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(options.getByText('设置已保存，开始阅读吧。')).toBeVisible();
    const stored = await options.evaluate(async () => ({
      local: await chrome.storage.local.get(null),
      sync: await chrome.storage.sync.get(null),
      public: await chrome.runtime.sendMessage({ type: 'settings:get' }),
    }));
    expect(JSON.stringify(stored.local)).toContain('margin-test-key');
    expect(JSON.stringify(stored.sync)).not.toContain('margin-test-key');
    expect(JSON.stringify(stored.public)).not.toContain('margin-test-key');
    await options.reload();
    await expect(options.getByLabel('阅读模型', { exact: true })).toHaveValue('margin-test');
    await expect(options.getByLabel('思考强度', { exact: true })).toHaveValue('none');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByLabel('阅读模型', { exact: true })).toHaveValue('margin-test');
    await expect(popup.getByLabel('思考强度', { exact: true })).toHaveValue('none');
    await popup.setViewportSize({ width: 392, height: 800 });
    await popup.screenshot({ path: 'docs/screenshots/popup.png', fullPage: true });
    await popup.close();
  });

  test('selection opens isolated assistant-ui, streams, and sends bounded page context with follow-up history', async () => {
    article = await context.newPage();
    await article.goto(`${origin}/article?token=private#secret`);
    await article.keyboard.press('Space');
    await expect(article.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => article.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // Navigation cancels the browser's ongoing Space scroll animation before checking interception.
    await article.reload();
    await article.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const scrollBefore = await article.evaluate(() => window.scrollY);
    await selectPhrase(article);
    await expect(article.getByLabel('向 Margin 提问')).toBeVisible();
    expect(await article.evaluate(() => window.scrollY)).toBe(scrollBefore);
    await expect(article.getByText('作者说，理解故事不只看字面', { exact: false })).toBeVisible();
    await expect(article.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    const last = requests.at(-1)!;
    expect(last.reasoning_effort).toBe('none');
    expect(last.messages.at(-1)?.content).toContain('翻译');
    expect(last.messages.at(-1)?.content).toContain('上下文解释');
    expect(last.messages[0]?.role).toBe('system');
    const payload = last.messages[1]!.content;
    expect(payload).toContain('read between the lines');
    expect(payload).toContain('It is about finding meaning');
    expect(payload).not.toContain('SECRET_');
    expect(payload).not.toContain('OFFSCREEN_TEXT');
    expect(payload).not.toContain('token=private');
    expect(
      await article
        .getByRole('button', { name: '发送问题' })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe('rgb(255, 0, 0)');
    expect(
      await article
        .getByLabel('向 Margin 提问')
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(80);
    await expect(article.getByText('体会没有直接说出来的意思。', { exact: false })).toBeVisible();
    await article.screenshot({
      path: 'docs/screenshots/reader.png',
      style: 'main > form { visibility: hidden !important; }',
    });
    const input = article.getByLabel('向 Margin 提问');
    await input.pressSequentially('Explain this');
    await expect(input).toHaveValue('Explain this');
    await input.fill('');
    // Chromium's IME path exercises composition, unlike Playwright's fill().
    const cdp = await context.newCDPSession(article);
    await cdp.send('Input.imeSetComposition', {
      text: '请举一个例子',
      selectionStart: 6,
      selectionEnd: 6,
    });
    await expect(input).toHaveValue('请举一个例子');
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      isComposing: true,
    });
    expect(requests.at(-1)).toBe(last);
    await cdp.send('Input.insertText', { text: '请举一个例子' });
    await expect(input).toHaveValue('请举一个例子');
    await cdp.detach();
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('请举一个例子\n');
    await input.press('Backspace');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(article.getByText('她虽然微笑着答应', { exact: false })).toBeVisible();
    expect(requests.at(-1)!.messages.at(-1)?.content).toBe('请举一个例子');
    expect(requests.at(-1)?.reasoning_effort).toBe('none');
    expect(requests.at(-1)!.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    await article.keyboard.press('Escape');
    await expect(article.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => errors).toEqual([]);
  });

  test('first explanation stays at the top; follow-ups track the stream until the reader scrolls up', async () => {
    const page = await context.newPage();
    streamingParagraphs = Array.from(
      { length: 50 },
      (_, index) =>
        `第 ${index + 1} 段：结合上下文理解这句话，留意作者的语气和没有直接表达的意思。\n\n`,
    );
    try {
      await page.goto(`${origin}/scrolling`);
      await selectPhrase(page);
      const viewport = page.locator('.margin-viewport');
      const metrics = () =>
        viewport.evaluate((element) => ({
          top: element.scrollTop,
          height: element.scrollHeight,
          bottom: element.scrollHeight - element.clientHeight - element.scrollTop,
        }));
      await expect.poll(async () => (await metrics()).bottom).toBeGreaterThan(300);
      expect((await metrics()).top).toBe(0);
      await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
      expect((await metrics()).top).toBe(0);

      const input = page.getByLabel('向 Margin 提问');
      await input.fill('请进一步解释');
      await input.press('Enter');
      await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
      await expect.poll(async () => (await metrics()).bottom).toBeLessThan(2);
      const following = await metrics();
      await expect
        .poll(async () => (await metrics()).height)
        .toBeGreaterThan(following.height + 150);
      await expect.poll(async () => (await metrics()).bottom).toBeLessThan(2);

      await viewport.hover();
      const beforeWheel = await metrics();
      await page.mouse.wheel(0, -600);
      await expect.poll(async () => (await metrics()).top).toBeLessThan(beforeWheel.top - 200);
      // Wait for the wheel gesture to settle, then verify continued output cannot pull us down.
      await expect.poll(async () => (await metrics()).bottom).toBeGreaterThan(500);
      const reading = await metrics();
      await expect.poll(async () => (await metrics()).height).toBeGreaterThan(reading.height + 150);
      expect(Math.abs((await metrics()).top - reading.top)).toBeLessThan(2);

      await page.getByRole('button', { name: '滚动到最新回答' }).click();
      await expect.poll(async () => (await metrics()).bottom).toBeLessThan(2);
      const resumed = await metrics();
      await expect.poll(async () => (await metrics()).height).toBeGreaterThan(resumed.height + 150);
      await expect.poll(async () => (await metrics()).bottom).toBeLessThan(2);
      await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);

      await viewport.hover();
      await page.mouse.wheel(0, -600);
      await expect.poll(async () => (await metrics()).bottom).toBeGreaterThan(200);
      await input.fill('再举一个例子');
      await page.getByRole('button', { name: '发送问题' }).click();
      await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
      await expect.poll(async () => (await metrics()).bottom).toBeLessThan(2);
      await page.getByRole('button', { name: '停止生成' }).click();
      await expect.poll(() => errors).toEqual([]);
    } finally {
      streamingParagraphs = undefined;
      await page.close();
    }
  });

  test('configured shortcut propagates without reloading the article and unmodified selections stay quiet', async () => {
    await options.getByRole('button', { name: '阅读偏好', exact: true }).click();
    const shortcut = options.getByRole('button', { name: '设置划词快捷键', exact: true });
    await expect(shortcut).toContainText('空格');
    await shortcut.click();
    await options.keyboard.press('KeyT');
    await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
    await expect(shortcut).toContainText('T');
    await shortcut.click();
    await options.keyboard.press('Space');
    await expect(shortcut).toContainText('空格');
    await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
    await shortcut.click();
    await options.keyboard.down('Alt');
    await options.keyboard.press('Escape');
    await options.keyboard.up('Alt');
    await expect(shortcut).toContainText('空格');
    await shortcut.click();
    await options.keyboard.down('Control');
    await options.keyboard.down('Shift');
    await options.keyboard.down('KeyK');
    await options.keyboard.up('Control');
    await expect(shortcut).toHaveAttribute('aria-pressed', 'true');
    await options.keyboard.up('KeyK');
    await options.keyboard.up('Shift');
    await expect(shortcut).toContainText('Ctrl + ⇧ Shift + K');
    await expect(shortcut).toHaveAttribute('aria-pressed', 'false');
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(options.getByText('设置已保存，开始阅读吧。')).toBeVisible();
    await options.reload();
    await options.getByRole('button', { name: '阅读偏好', exact: true }).click();
    await expect(shortcut).toContainText('Ctrl + ⇧ Shift + K');
    await article.bringToFront();
    await article.locator('#target').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
    });
    await article.keyboard.press('Alt');
    await expect(article.getByRole('dialog')).toHaveCount(0);
    await selectPhrase(article, 'Control+Shift+KeyK');
    await article.keyboard.press('Escape');
    await options.getByRole('switch', { name: '启用 Margin', exact: true }).click();
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(options.getByText('设置已保存，开始阅读吧。')).toBeVisible();
    await article.keyboard.press('Control+Shift+KeyK');
    await expect(article.getByRole('dialog')).toHaveCount(0);
    await options.getByRole('switch', { name: '启用 Margin', exact: true }).click();
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
  });

  test('generation can be cancelled and provider errors are actionable', async () => {
    await options.getByRole('button', { name: 'AI 连接', exact: true }).click();
    await options.getByLabel('阅读模型', { exact: true }).fill('slow-model');
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await article.reload();
    await selectPhrase(article, 'Control+Shift+KeyK');
    await expect(article.getByRole('button', { name: '停止生成' })).toBeVisible();
    await article.getByRole('button', { name: '停止生成' }).click();
    await expect(article.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    await article.keyboard.press('Escape');
    await options.getByLabel('阅读模型', { exact: true }).fill('invalid-model');
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await article.reload();
    await selectPhrase(article, 'Control+Shift+KeyK');
    await expect(article.getByText('API Key 无效或已过期，请检查后重试。')).toBeVisible();
    await expect(article.getByRole('button', { name: '重新生成' })).toBeVisible();
  });

  test('real Option-drag supports automatic explanation, limited context, and opt-in credential sync', async () => {
    await article.keyboard.press('Escape');
    await options.getByLabel('阅读模型', { exact: true }).fill('margin-test');
    await options.getByRole('button', { name: '阅读偏好', exact: true }).click();
    await options.getByRole('button', { name: '设置划词快捷键', exact: true }).click();
    await options.keyboard.press('Alt');
    await options.getByRole('switch', { name: '按住快捷键划词后自动解释', exact: true }).click();
    await options.getByLabel('网页上下文', { exact: true }).selectOption('selection');
    await options.getByLabel('解释语言', { exact: true }).selectOption('en');
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(options.getByText('设置已保存，开始阅读吧。')).toBeVisible();
    await options.screenshot({ path: 'docs/screenshots/preferences.png', fullPage: true });
    await article.reload();
    await expect(async () => {
      await article.evaluate(() => getSelection()?.removeAllRanges());
      const box = (await article.locator('#target').boundingBox())!;
      await article.keyboard.down('Alt');
      await article.mouse.move(box.x + 1, box.y + box.height / 2);
      await article.mouse.down();
      await article.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 12 });
      await article.mouse.up();
      await article.keyboard.up('Alt');
      await expect(article.getByRole('dialog')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await expect(article.getByText('作者说，理解故事不只看字面', { exact: false })).toBeVisible();
    const request = requests.at(-1)!;
    expect(request.messages[0]!.content).toContain('Respond in English');
    const data = JSON.parse(request.messages[1]!.content.split('\n').slice(1).join('\n'));
    expect(data.selection).toBe('read between the lines');
    expect(data.paragraph).toBe('');
    expect(data.visibleText).toBe('');
    await options.getByRole('button', { name: '同步与隐私', exact: true }).click();
    await options.getByRole('switch', { name: '同时同步 API Key', exact: true }).click();
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect
      .poll(async () =>
        options.evaluate(async () => JSON.stringify(await chrome.storage.sync.get(null))),
      )
      .toContain('margin-test-key');
    await options.getByRole('switch', { name: '同时同步 API Key', exact: true }).click();
    await options.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect
      .poll(async () =>
        options.evaluate(async () => JSON.stringify(await chrome.storage.sync.get(null))),
      )
      .not.toContain('margin-test-key');
    await options.screenshot({ path: 'docs/screenshots/privacy.png', fullPage: true });
    await options.setViewportSize({ width: 600, height: 900 });
    await expect(options.getByRole('heading', { name: '阅读随行，隐私随心。' })).toBeVisible();
    expect(await options.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      600,
    );
    await options.getByRole('button', { name: '使用指南', exact: true }).click();
    await expect(options.getByRole('heading', { name: '只差一句解释的距离。' })).toBeVisible();
    expect(await options.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      600,
    );
  });
});
