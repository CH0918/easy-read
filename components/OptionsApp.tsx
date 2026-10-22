import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  FolderArchive,
  Globe2,
  Keyboard,
  LockKeyhole,
  MessageCircle,
  MousePointer2,
  PlugZap,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Brand } from './Logo';
import { ConnectionForm } from './ConnectionForm';
import { ReadingPreview } from './ReadingPreview';
import { SettingsBackup } from './SettingsBackup';
import { ShortcutRecorder } from './ShortcutRecorder';
import { useSettings } from './useSettings';
import { Button, SectionTitle, SettingRow, Toggle } from './ui';
import { isConfigured, shortcutLabel } from '../lib/settings';
import { inExtension } from '../lib/storage';
import type { Settings } from '../lib/types';

type Tab = 'connection' | 'reading' | 'privacy' | 'backup' | 'guide';
const tabs = [
  { id: 'connection', label: 'AI 连接', icon: PlugZap },
  { id: 'reading', label: '阅读偏好', icon: BookOpen },
  { id: 'privacy', label: '同步与隐私', icon: Cloud },
  { id: 'backup', label: '备份与恢复', icon: FolderArchive },
  { id: 'guide', label: '使用指南', icon: MousePointer2 },
] as const;

function Preferences({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  return (
    <section className="card settings-card">
      <div className="card-heading">
        <div className="card-icon">
          <Keyboard size={20} />
        </div>
        <div>
          <h2>按照你的习惯阅读</h2>
          <p>让每一次提问都自然发生。</p>
        </div>
      </div>
      <SettingRow
        title="划词快捷键"
        description="先选中文字，再按快捷键，立即在旁边翻译并结合上下文解释。"
      >
        <ShortcutRecorder value={settings.shortcut} onChange={(shortcut) => update({ shortcut })} />
      </SettingRow>
      <p className="inline-help">
        点击后按下新快捷键，松开全部按键确认，再保存设置。支持空格等单键、Option / Alt 和组合键；Esc
        取消。输入框内不会触发。
      </p>
      <SettingRow title="解释语言" description="保留英文原文，用你熟悉的语言理解。">
        <select
          aria-label="解释语言"
          value={settings.language}
          onChange={(event) => update({ language: event.target.value as Settings['language'] })}
        >
          <option value="zh-CN">简体中文</option>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
      </SettingRow>
      <SettingRow title="解释详细程度" description="先说清楚意思，需要时再展开。">
        <select
          aria-label="解释详细程度"
          value={settings.answerStyle}
          onChange={(event) =>
            update({ answerStyle: event.target.value as Settings['answerStyle'] })
          }
        >
          <option value="concise">简洁明了</option>
          <option value="detailed">详细讲解</option>
        </select>
      </SettingRow>
      <SettingRow title="网页上下文" description="结合上下文，理解单词在这篇文章里的真正含义。">
        <select
          aria-label="网页上下文"
          value={settings.contextMode}
          onChange={(event) =>
            update({ contextMode: event.target.value as Settings['contextMode'] })
          }
        >
          <option value="visible">当前可见内容 + 所在段落</option>
          <option value="paragraph">仅所在段落</option>
          <option value="selection">仅选中文字</option>
        </select>
      </SettingRow>
      <SettingRow
        title="按住快捷键划词后自动解释"
        description="使用含修饰键的快捷键时，也可按住它拖选文字。此开关控制拖选后是否自动解释；先选词再按键始终自动翻译与解释。"
      >
        <Toggle
          label="按住快捷键划词后自动解释"
          checked={settings.autoExplain}
          disabled={!settings.shortcut.modifiers.length}
          onChange={(autoExplain) => update({ autoExplain })}
        />
      </SettingRow>
      <SettingRow title="启用 Margin" description="随时暂停，下次需要时再开启。">
        <Toggle
          label="启用 Margin"
          checked={settings.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </SettingRow>
    </section>
  );
}

function Privacy({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  return (
    <>
      <section className="card settings-card">
        <div className="card-heading">
          <div className="card-icon">
            <Cloud size={20} />
          </div>
          <div>
            <h2>换一台设备，依然熟悉</h2>
            <p>使用 Chrome 账号，带上你的阅读习惯。</p>
          </div>
        </div>
        <SettingRow
          title="同步插件设置"
          description="通过 Chrome 同步服务地址、模型和阅读偏好。需要登录同一账号并开启同步。"
        >
          <Toggle
            label="同步插件设置"
            checked={settings.syncEnabled}
            onChange={(syncEnabled) =>
              update({ syncEnabled, ...(!syncEnabled ? { syncApiKey: false } : {}) })
            }
          />
        </SettingRow>
        <SettingRow
          title="同时同步 API Key"
          description="可选。密钥将写入 Chrome 账号同步存储，让其他设备也能直接使用。关闭后移除云端密钥。"
        >
          <Toggle
            label="同时同步 API Key"
            checked={settings.syncEnabled && settings.syncApiKey}
            disabled={!settings.syncEnabled}
            onChange={(syncApiKey) => update({ syncApiKey })}
          />
        </SettingRow>
        <div className="info-box">
          <ShieldCheck size={18} />
          <p>
            {settings.syncEnabled && settings.syncApiKey
              ? '已选择同步密钥。Chrome 同步存储不等同于专业密码保险库，请使用独立且有额度限制的 API Key。'
              : 'API Key 默认只保存在这台设备上。开启设置同步后，在新设备补充密钥即可使用。'}
          </p>
        </div>
      </section>
      <section className="card settings-card">
        <div className="card-heading">
          <div className="card-icon">
            <LockKeyhole size={20} />
          </div>
          <div>
            <h2>你的阅读，属于你</h2>
            <p>没有 Margin 账号，也没有中转服务器。</p>
          </div>
        </div>
        <div className="privacy-grid">
          <div>
            <Globe2 size={21} />
            <h3>直连你选择的 AI</h3>
            <p>只有你发起解释时，选中文字与选定的上下文才会发送给配置的 AI 服务商。</p>
          </div>
          <div>
            <MessageCircle size={21} />
            <h3>对话留在当下</h3>
            <p>对话仅存在于浮窗内存中，关闭后清除。阅读记录和网页内容不参与 Chrome 同步。</p>
          </div>
          <div>
            <ShieldCheck size={21} />
            <h3>有边界的上下文</h3>
            <p>不采集输入框、表单、隐藏元素；网页地址移除查询参数和锚点。</p>
          </div>
        </div>
      </section>
      <div className="sync-note">
        <Cloud size={19} />
        <div>
          <h3>关于自动安装到其他设备</h3>
          <p>
            Chrome
            商店版在同一账号开启「扩展程序」同步后可自动安装。本地加载的开发版需要在每台设备分别加载，且扩展
            ID 必须一致才能共享设置。当前项目尚未上架商店。
          </p>
        </div>
      </div>
    </>
  );
}

function Guide() {
  return (
    <>
      <section className="card guide-card">
        <div>
          <div className="eyebrow">A SMALL HELP, A BIG DIFFERENCE</div>
          <h2>不跳走，也能读懂。</h2>
          <p>
            把注意力留在文章里，
            <br />让 Margin 处理那一点不理解。
          </p>
        </div>
        <ReadingPreview />
      </section>
      <div className="guide-steps">
        {[
          {
            icon: PlugZap,
            title: '连接你的 AI',
            text: '选择服务商，输入 API Key。自动检测模型后，测试连接并保存。',
          },
          {
            icon: MousePointer2,
            title: '选中文字，按下空格',
            text: '在普通网页选中一个单词或一句话，再按空格键（默认快捷键）。',
          },
          {
            icon: Sparkles,
            title: '问清楚，继续读',
            text: '卡片会自动翻译并结合上下文解释。还可以继续追问、复制回答和重新生成。',
          },
        ].map((step, i) => (
          <section className="card" key={step.title}>
            <div className="step-number">
              0{i + 1}
              <step.icon size={19} />
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </section>
        ))}
      </div>
      <section className="card faq">
        <h2>再多了解一点</h2>
        <details>
          <summary>为什么有的页面没有浮窗？</summary>
          <p>
            Chrome 内置页面、Chrome 网上应用店、浏览器 PDF
            阅读器和其他扩展页面不允许注入插件。安装或更新后，请刷新已经打开的网页。跨域 iframe
            和输入框内不触发划词。
          </p>
        </details>
        <details>
          <summary>支持哪些 AI 服务？</summary>
          <p>
            支持兼容 OpenAI 的 /models 与 /chat/completions 接口，包括
            OpenAI、DeepSeek、OpenRouter、Ollama 和自建网关。原生 Anthropic
            等不同协议暂不支持，可通过兼容网关使用。不提供模型列表的服务可以手动填写模型 ID。
          </p>
        </details>
        <details>
          <summary>快捷键与网站冲突了怎么办？</summary>
          <p>
            在「阅读偏好」中点击快捷键按钮，录入空格、字母或 Ctrl + Shift + K
            等组合，松开按键后保存。 先选中文字，再按快捷键即可自动翻译与解释；浮窗内按 Esc
            关闭。含修饰键的快捷键也支持按住后拖选文字。
          </p>
        </details>
        <details>
          <summary>如何使用本地 Ollama？</summary>
          <p>
            先启动 Ollama 并下载模型，选择 Ollama 服务商，默认地址为 http://localhost:11434/v1，无需
            API Key。如果出现 403，请按 Ollama 文档为扩展来源配置 OLLAMA_ORIGINS。
          </p>
        </details>
      </section>
    </>
  );
}

export function OptionsApp() {
  const [tab, setTab] = useState<Tab>(() =>
    window.location.hash === '#backup' ? 'backup' : 'connection',
  );
  const state = useSettings();
  const { settings, update, ready, saving, save, dirty, notice } = state;
  const [previewNotice, setPreviewNotice] = useState(!inExtension());
  const title = {
    connection: [
      'YOUR READING COMPANION',
      '好奇，不必止于语言。',
      '连接你喜欢的 AI，让每一个不懂的词句，都成为理解的开始。',
    ],
    reading: [
      'MAKE IT YOURS',
      '以你的节奏，读懂世界。',
      '从快捷键到解释方式，为自己留一处顺手的页边。',
    ],
    privacy: [
      'YOURS, EVERYWHERE',
      '阅读随行，隐私随心。',
      '让熟悉的设置跟随你，同时决定哪些信息留在本机。',
    ],
    backup: [
      'KEEP YOUR SETTINGS',
      '配置留一份，重装更轻松。',
      '保存你的 AI 连接和阅读偏好，重装或换设备时直接恢复。',
    ],
    guide: [
      'A GENTLE START',
      '只差一句解释的距离。',
      '三个简单步骤，让下一篇英文文章读起来更轻松。',
    ],
  }[tab];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">工作空间</div>
        <nav aria-label="设置导航">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {tab === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="small-sparkle">✳</span>
            <p>
              少一点语言的阻碍，
              <br />
              多一点阅读的自在。
            </p>
          </div>
          <div className="sidebar-version">
            <span>
              <span className="status-dot green" />
              Margin v0.1.0
            </span>
            <span>MADE FOR CURIOSITY</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span>你的阅读空间</span>
            <ChevronRight size={13} />
            <span>{tabs.find((item) => item.id === tab)?.label}</span>
          </div>
          <button type="button" className="topbar-help" onClick={() => setTab('guide')}>
            <BookOpen size={15} />
            快速上手
            <ArrowRight size={14} />
          </button>
        </header>
        <main className="settings-main">
          {previewNotice && (
            <div className="preview-banner">
              <span>界面预览模式 · 加载 Chrome 扩展后即可连接 AI 和使用划词功能。</span>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭预览提示"
                onClick={() => setPreviewNotice(false)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <SectionTitle eyebrow={title[0]!} title={title[1]!} description={title[2]!} />
          {tab === 'connection' && (
            <>
              <div className="welcome-banner">
                <div className="welcome-copy">
                  <div className="subtle-pill">
                    <Sparkles size={12} />
                    不打断阅读的 AI 小帮手
                  </div>
                  <h2>
                    在字里行间，
                    <br />
                    找到<span>恍然大悟。</span>
                  </h2>
                  <p>
                    选中一句不懂的英文，把问题留在页边。
                    <br />
                    有上下文的解释，比单纯的翻译更进一步。
                  </p>
                  <div className="hero-shortcut">
                    <MousePointer2 size={14} />
                    <span>选中文字</span>
                    <ArrowRight size={14} />
                    <span>按</span>
                    <kbd>{shortcutLabel(settings.shortcut)}</kbd>
                  </div>
                </div>
                <ReadingPreview />
              </div>
              <div className="connection-grid">
                <section className="card connection-card">
                  <div className="card-heading">
                    <div className="card-icon">
                      <PlugZap size={20} />
                    </div>
                    <div>
                      <h2>连接 AI 服务</h2>
                      <p>你熟悉的模型，现在也是你的阅读伙伴。</p>
                    </div>
                    <span className={`badge ${isConfigured(state.saved) ? 'badge-green' : ''}`}>
                      {isConfigured(state.saved) ? '已配置' : '等待配置'}
                    </span>
                  </div>
                  {ready && <ConnectionForm settings={settings} update={update} />}
                  <div className="connection-backup-link">
                    <button type="button" className="text-link" onClick={() => setTab('backup')}>
                      <FolderArchive size={15} />
                      备份 / 恢复配置
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
                <aside className="connection-aside">
                  <section className="card how-card">
                    <div className="card-heading">
                      <h2>让理解，自然发生</h2>
                      <MousePointer2 size={17} />
                    </div>
                    <div className="mini-step">
                      <span>1</span>
                      <div>
                        <h3>选中，按键</h3>
                        <p>选中词句，再按 {shortcutLabel(settings.shortcut)}。</p>
                      </div>
                    </div>
                    <div className="mini-step">
                      <span>2</span>
                      <div>
                        <h3>在页边，读解释</h3>
                        <p>自动翻译，结合上下文说明关键含义。</p>
                      </div>
                    </div>
                    <div className="mini-step">
                      <span>3</span>
                      <div>
                        <h3>读懂，然后继续</h3>
                        <p>AI 结合网页上下文回答，理解更贴切。</p>
                      </div>
                    </div>
                    <button type="button" className="text-link" onClick={() => setTab('guide')}>
                      看看使用指南
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="privacy-aside">
                    <div className="privacy-aside-icon">
                      <ShieldCheck size={21} />
                    </div>
                    <h3>安心留在你的页边</h3>
                    <p>密钥默认仅存本机。网页内容直达你选择的 AI 服务，Margin 不收集阅读记录。</p>
                    <button type="button" className="text-link" onClick={() => setTab('privacy')}>
                      了解同步与隐私
                      <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
          {tab === 'reading' && <Preferences settings={settings} update={update} />}
          {tab === 'privacy' && <Privacy settings={settings} update={update} />}
          {tab === 'backup' && (
            <SettingsBackup
              saved={state.saved}
              ready={ready}
              saving={saving}
              dirty={dirty}
              restore={state.restore}
            />
          )}
          {tab === 'guide' && <Guide />}
          {tab !== 'guide' && (
            <div className="save-bar">
              <div className={notice?.error ? 'save-message error' : 'save-message'} role="status">
                {notice ? (
                  <>
                    {notice.error ? <X size={15} /> : <Check size={15} />}
                    {notice.text}
                  </>
                ) : dirty ? (
                  <>
                    <span className="status-dot amber" />
                    {state.draftMessage}
                  </>
                ) : (
                  <>
                    <LockKeyhole size={14} />
                    设置你的阅读伙伴，从这里开始。
                  </>
                )}
              </div>
              <Button loading={saving} disabled={!ready} onClick={() => void save()}>
                <Check size={16} />
                保存设置
              </Button>
            </div>
          )}
          <footer className="page-footer">
            <span>一点点理解，通往更大的世界。</span>
            <span>Margin · 在你的页边</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
