import { useRef, useState, type ChangeEvent } from 'react';
import { Download, FolderArchive, Upload } from 'lucide-react';
import {
  downloadSettingsBackup,
  MAX_BACKUP_BYTES,
  parseSettingsBackup,
  type BackupSettings,
} from '../lib/backup';
import type { Settings } from '../lib/types';
import { Button } from './ui';

export function SettingsBackup({
  saved,
  ready,
  saving,
  dirty,
  restore,
}: {
  saved: Settings;
  ready: boolean;
  saving: boolean;
  dirty: boolean;
  restore: (settings: BackupSettings) => Promise<boolean>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const disabled = !ready || saving || reading;

  const exportBackup = () => {
    try {
      downloadSettingsBackup(saved);
      setMessage({ text: '已发起备份下载，请保留下载的 JSON 文件，重装后用它恢复。' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : '备份失败，请重试。',
        error: true,
      });
    }
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;
    setReading(true);
    setMessage(null);
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('备份文件过大，请选择 Margin 导出的配置文件。');
      const backup = parseSettingsBackup(await file.text());
      if (await restore(backup)) {
        setMessage({ text: '配置已恢复并生效，无需重新填写地址、密钥和模型。' });
      } else {
        setMessage({ text: '恢复未完成，请查看下方提示后重试。', error: true });
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : '恢复失败，请重新选择备份文件。',
        error: true,
      });
    } finally {
      setReading(false);
    }
  };

  return (
    <section className="card settings-card">
      <div className="card-heading">
        <div className="card-icon">
          <FolderArchive size={20} />
        </div>
        <div>
          <h2>重装后，一键找回配置</h2>
          <p>把配置保存为文件，下次安装时从备份恢复。</p>
        </div>
      </div>
      <p className="backup-description">
        备份包含服务商、Base URL、API
        Key、模型和阅读偏好。把文件留在电脑或自己的网盘里，卸载插件不会删除它。
      </p>
      <div className="backup-actions">
        <Button variant="secondary" disabled={disabled || dirty} onClick={exportBackup}>
          <Download size={16} />
          备份已保存配置
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          loading={reading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} />
          从备份恢复
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="选择 Margin 配置备份"
          hidden
          onChange={(event) => void importBackup(event)}
        />
      </div>
      {dirty && <p className="field-hint">有尚未保存的更改，请先点击下方「保存设置」再备份。</p>}
      <p className="field-hint">
        文件含明文 API Key，请妥善保存。恢复会替换当前 AI 连接和阅读偏好，并沿用本机的同步选项。
      </p>
      <p className="field-hint">
        Chrome
        同步用于设备间同步，不能代替卸载前的备份。重装后需要选择备份文件，插件无法自动读取电脑或网盘中的文件。
      </p>
      {message && (
        <p className={message.error ? 'field-error' : 'success-notice'} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
