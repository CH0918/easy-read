import ReactDOM from 'react-dom/client';
import { ArrowRight, Check, FolderArchive, Settings2, Sparkles } from 'lucide-react';
import { Brand } from '../../components/Logo';
import { Button, Toggle } from '../../components/ui';
import { ConnectionForm } from '../../components/ConnectionForm';
import { useSettings } from '../../components/useSettings';
import { openBackupOptions, openOptions } from '../../lib/storage';
import { shortcutLabel } from '../../lib/settings';
import '../../styles/app.css';

function Popup() {
  const { settings, ready, saving, notice, dirty, draftMessage, update, save } = useSettings();
  return (
    <div className="popup-shell">
      <header className="popup-header">
        <Brand compact />
        <button
          className="icon-button"
          type="button"
          aria-label="打开完整设置"
          onClick={openOptions}
        >
          <Settings2 size={19} />
        </button>
      </header>
      <div className="popup-intro">
        <div>
          <h1>让理解，留在页边。</h1>
          <p>你的 AI 阅读伙伴，随时准备好。</p>
        </div>
        <Sparkles size={25} />
      </div>
      <div className="popup-content">
        {ready && <ConnectionForm settings={settings} update={update} compact />}
        <div className="popup-enabled">
          <span>启用划词助手</span>
          <Toggle
            label="启用划词助手"
            checked={settings.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </div>
        {dirty && !notice && (
          <p className="field-hint" role="status">
            {draftMessage}
          </p>
        )}
        {notice && (
          <p className={notice.error ? 'field-error' : 'success-notice'} role="status">
            {notice.text}
          </p>
        )}
        <Button
          className="full-width"
          loading={saving}
          disabled={!ready}
          onClick={() => void save()}
        >
          <Check size={15} />
          {dirty ? '保存更改' : '保存设置'}
        </Button>
        <Button className="full-width" variant="ghost" onClick={openBackupOptions}>
          <FolderArchive size={15} />
          备份 / 恢复配置
        </Button>
      </div>
      <footer className="popup-footer">
        <span>选中文字 → 按{shortcutLabel(settings.shortcut)}</span>
        <button type="button" className="text-link" onClick={openOptions}>
          更多设置
          <ArrowRight size={13} />
        </button>
      </footer>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
