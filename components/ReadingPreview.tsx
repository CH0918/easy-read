import { ArrowUp, Sparkles } from 'lucide-react';
import { Logo } from './Logo';

export function ReadingPreview() {
  return (
    <div className="reading-preview" aria-label="划词阅读效果示意">
      <div className="preview-paper">
        <div className="paper-kicker">
          <span /> THE READING ROOM
        </div>
        <h3>
          A little context
          <br />
          changes everything.
        </h3>
        <p>
          Sometimes, all you need is to
          <br />
          <mark>read between the lines.</mark>
        </p>
        <div className="paper-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="preview-answer">
        <div className="preview-answer-top">
          <Logo width={23} height={23} />
          <span>理解这一句</span>
          <Sparkles size={12} />
        </div>
        <p>
          <strong>read between the lines</strong>
          <br />
          读懂字里行间的意思，理解言外之意。
        </p>
        <div className="preview-input">
          <span>原来如此，还可以这样用…</span>
          <ArrowUp size={13} />
        </div>
      </div>
      <span className="preview-caption">一点解释，豁然开朗。</span>
    </div>
  );
}
