import { ChangeEvent, useRef, useState, useEffect } from 'react';
import type { CommunityMessage } from './types';
import { cn } from './utils';
import { EmojiPicker, parseEmojiShortcuts, getEmojiPreview } from './EmojiPicker';

interface MessageInputProps {
  draftMessage: string;
  replyingTo: CommunityMessage | null;
  editingMessage: CommunityMessage | null;
  editDraft: string;
  selectedFiles: File[];
  previewUrls: string[];
  uploading: boolean;
  uploadProgress: number;
  sending: boolean;
  inputDisabled: boolean;
  activeThreadId: string;
  activeLabel: string;
  onDraftChange: (value: string) => void;
  onEditDraftChange: (value: string) => void;
  onSend: () => void;
  onEditSave: () => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearFiles: () => void;
  onTyping: () => void;
}

export function MessageInput({
  draftMessage,
  replyingTo,
  editingMessage,
  editDraft,
  selectedFiles,
  previewUrls,
  uploading,
  uploadProgress,
  sending,
  inputDisabled,
  activeThreadId,
  activeLabel,
  onDraftChange,
  onEditDraftChange,
  onSend,
  onEditSave,
  onCancelReply,
  onCancelEdit,
  onFileSelect,
  onClearFiles,
  onTyping,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPreview, setEmojiPreview] = useState<{ emoji: string; position: number } | null>(null);

  const currentDraft = editingMessage ? editDraft : draftMessage;
  const handleDraftChange = editingMessage ? onEditDraftChange : onDraftChange;

  useEffect(() => {
    const preview = getEmojiPreview(currentDraft);
    setEmojiPreview(preview);
  }, [currentDraft]);

  const handleEmojiSelect = (emoji: string) => {
    handleDraftChange(currentDraft + emoji);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    handleDraftChange(value);
    if (!editingMessage) {
      onTyping();
    }
  };

  const handleSendClick = () => {
    const processedMessage = parseEmojiShortcuts(currentDraft);
    handleDraftChange(processedMessage);
    setTimeout(() => {
      if (editingMessage) {
        onEditSave();
      } else {
        onSend();
      }
    }, 0);
  };

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <div className="flex-1">
            <div className="font-semibold">Replying to {replyingTo.senderName || 'User'}</div>
            <div className="truncate text-slate-600">{replyingTo.body}</div>
          </div>
          <button onClick={onCancelReply} className="text-slate-500 hover:text-slate-700">
            ✕
          </button>
        </div>
      )}
      {editingMessage && (
        <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-blue-900">Editing message</div>
          <input
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onEditSave();
              }
              if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
          />
          <div className="mt-1 flex gap-2">
            <button onClick={onEditSave} className="text-xs text-blue-600 hover:underline">
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs text-slate-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {selectedFiles.length > 0 && (
        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-700">
            {selectedFiles.length} file(s) selected
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                {file.type.startsWith('image/') && previewUrls[idx] ? (
                  <img
                    src={previewUrls[idx]}
                    alt={file.name}
                    className="h-20 w-20 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-white">
                    <div className="text-center">
                      <div className="text-2xl">📄</div>
                      <div className="text-[9px] text-slate-500 truncate w-16 px-1">
                        {file.name}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {uploading && (
            <div className="mb-2 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-500 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <button
            onClick={onClearFiles}
            className="mt-1 text-xs text-slate-600 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 relative">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={inputDisabled}
          className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Attach file"
        >
          📎
        </button>
        <button
          ref={emojiButtonRef}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={inputDisabled}
          className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Add emoji"
        >
          😊
        </button>
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
            buttonRef={emojiButtonRef}
          />
        )}
        <div className="relative flex-1">
          <input
            value={currentDraft}
            onChange={handleInputChange}
            placeholder={activeThreadId ? `Message ${activeLabel}` : 'Select a thread to message'}
            disabled={inputDisabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendClick();
              }
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:bg-slate-100"
          />
          {emojiPreview && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-2xl pointer-events-none">
              {emojiPreview.emoji}
            </div>
          )}
        </div>
        <button
          onClick={handleSendClick}
          disabled={inputDisabled || (!currentDraft.trim() && selectedFiles.length === 0)}
          className="rounded-2xl bg-[var(--community-accent)] px-4 py-3 text-xs font-semibold text-[var(--community-ink)] shadow-[0_10px_25px_-16px_rgba(74,222,128,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 min-w-[80px] flex items-center justify-center"
        >
          {sending || uploading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : editingMessage ? (
            'Save'
          ) : (
            'Send'
          )}
        </button>
      </div>
    </div>
  );
}