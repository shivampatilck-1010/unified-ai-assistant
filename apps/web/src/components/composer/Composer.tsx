import { useState, useRef, useEffect } from 'react';
import type { ChatAttachment } from '../../types';
import './Composer.css';

interface ComposerProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  isStreaming: boolean;
  onCancel?: () => void;
  disabled?: boolean;
}

export function Composer({ onSend, isStreaming, onCancel, disabled }: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isStreaming && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    onSend(value.trim(), attachments.length > 0 ? attachments : undefined);
    setValue('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // On mobile keyboards tapping Return appends '\n'
    if (val.endsWith('\n') && !val.endsWith('\n\n')) {
      const trimmed = val.replace(/\r?\n$/, '');
      if ((trimmed.trim().length > 0 || attachments.length > 0) && !isStreaming && !disabled) {
        onSend(trimmed.trim(), attachments.length > 0 ? attachments : undefined);
        setValue('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
    }
    setValue(val);
  };

  // Process selected files into ChatAttachment array
  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    fileArray.forEach((file) => {
      const isImg = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onload = () => {
        const resultStr = reader.result as string;
        const newAttachment: ChatAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || (isImg ? 'image/png' : 'application/octet-stream'),
          data: resultStr,
          previewUrl: isImg ? resultStr : undefined,
          size: file.size,
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      // Reset input value so re-selecting same file works
      e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData && e.clipboardData.items) {
      const items = Array.from(e.clipboardData.items);
      const imgFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imgFiles.push(file);
        }
      }
      if (imgFiles.length > 0) {
        processFiles(imgFiles);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Drag and drop support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [value]);

  // Listen for direct prompt insert from flashcards
  useEffect(() => {
    const handleInsert = (e: any) => {
      const text = e.detail;
      if (typeof text === 'string' && text) {
        setValue(text);
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
      }
    };
    window.addEventListener('insert-into-composer', handleInsert as EventListener);
    return () => window.removeEventListener('insert-into-composer', handleInsert as EventListener);
  }, []);

  return (
    <div
      className={`composer ${isDragging ? 'composer--dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.py,.csv,.html,.css"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="composer__inner">
        {attachments.length > 0 && (
          <div className="composer__attachments-strip">
            {attachments.map((att) => (
              <div key={att.id} className="composer__attachment-chip">
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="composer__attachment-thumb" />
                ) : (
                  <div className="composer__attachment-icon">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 2h5.5L13 5.5V14a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </div>
                )}
                <span className="composer__attachment-name" title={att.name}>
                  {att.name}
                </span>
                <button
                  type="button"
                  className="composer__attachment-remove-btn"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer__input-row">
          <button
            className="composer__attach-btn"
            aria-label="Attach images or documents"
            title="Attach images or documents (PNG, JPG, PDF, TXT, Code)"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M14.5 9.5l-5.6 5.6a3.5 3.5 0 01-5-5l6.3-6.3a2.25 2.25 0 013.2 3.2L7 13.3a1 1 0 01-1.4-1.4L11.3 6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            className="composer__input"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            enterKeyHint="send"
            placeholder={
              attachments.length > 0
                ? 'Ask about this image/document, or press Enter…'
                : 'Send a message or drop files here…'
            }
            rows={1}
            disabled={disabled}
            aria-label="Message input"
          />

          {isStreaming ? (
            <button
              className="composer__stop-btn"
              onClick={onCancel}
              type="button"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              className="composer__send-btn"
              onClick={handleSubmit}
              disabled={!canSend}
              type="button"
              aria-label="Send message"
              title="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="composer__hint">
        <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline · Paste or attach images/files
      </div>
    </div>
  );
}
