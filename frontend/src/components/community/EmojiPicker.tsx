import { useState, useRef, useEffect } from 'react';

const EMOJI_DATA = {
  'Smileys & Emotion': {
    icon: '😊',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
      '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
      '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
    ],
  },
  'Gestures & Body': {
    icon: '👍',
    emojis: [
      '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
      '👌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️',
      '🖖', '👋', '🤙', '💪', '🦾', '🖕', '✍️', '🙏', '🦶', '🦵',
      '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄',
      '💋', '🩸', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱',
      '🧑‍🦱', '👨‍🦱', '👩‍🦰', '🧑‍🦰', '👨‍🦰', '👱‍♀️', '👱', '👱‍♂️', '👩‍🦳', '🧑‍🦳',
    ],
  },
  'Animals & Nature': {
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
      '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
      '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎',
      '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟',
      '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧',
      '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌱', '🌿', '🍀', '🍁',
      '🍂', '🍃', '🌾', '🌲', '🌳', '🌴', '🌵', '☘️', '🌾', '🌿',
    ],
  },
  'Food & Drink': {
    icon: '🍕',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈',
      '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥒',
      '🥬', '🌶️', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖',
      '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚',
      '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱',
      '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤',
      '☕', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃',
      '🍸', '🍹', '🧉', '🧊', '🥄', '🍴', '🍽️', '🥢', '🥡', '🧋',
    ],
  },
  'Activity & Sports': {
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁',
      '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
      '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾',
      '🏌️', '🏇', '🧘', '🏊', '🚴', '🚵', '🎪', '🎭', '🎨', '🎬',
      '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻',
      '🎲', '♟️', '🎯', '🎮', '🕹️', '🎰', '🧩', '🧸', '🪅', '🪆',
    ],
  },
  'Travel & Places': {
    icon: '🚗',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔',
      '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝',
      '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫',
      '🛬', '🛩️', '💺', '🚁', '🛰️', '🚀', '🛸', '🚢', '⛵', '🛶',
      '⛴️', '🛥️', '🏠', '🏡', '🏢', '🏬', '🏭', '🏗️', '🏰', '🗼',
      '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁',
      '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '🌌', '🎠', '🎡',
    ],
  },
  'Objects': {
    icon: '💡',
    emojis: [
      '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️',
      '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️',
      '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭',
      '⏱️', '⏰', '🕰️', '⏳', '⌛', '📡', '🔋', '🔌', '💡', '🔦',
      '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙',
      '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️',
      '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧲', '🔫', '💣', '🧨',
      '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿',
    ],
  },
  'Symbols': {
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
      '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑',
      '♒', '♓', '⛎', '🔀', '🔁', '🔂', '▶️', '⏩', '⏭️', '⏯️',
      '◀️', '⏪', '⏮️', '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️',
      '⏏️', '🎦', '📶', '📳', '📴', '♀️', '♂️', '⚧️', '✖️', '➕',
      '➖', '➗', '♾️', '‼️', '⁉️', '❓', '❔', '❕', '❗', '〰️',
      '💱', '💲', '⚕️', '♻️', '⚜️', '🔱', '📛', '🔰', '⭐', '🌟',
      '✨', '⚡', '🔥', '💫', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️',
    ],
  },
};
const EMOJI_SHORTCUTS: { [key: string]: string } = {
  ':thumbs-up:': '👍',
  ':thumbsup:': '👍',
  ':thumbs-down:': '👎',
  ':thumbsdown:': '👎',
  ':smile:': '😊',
  ':grin:': '😁',
  ':heart:': '❤️',
  ':fire:': '🔥',
  ':clap:': '👏',
  ':check:': '✅',
  ':star:': '⭐',
  ':rocket:': '🚀',
  ':100:': '💯',
  ':eyes:': '👀',
  ':thinking:': '🤔',
  ':joy:': '😂',
  ':tada:': '🎉',
  ':pray:': '🙏',
  ':ok_hand:': '👌',
  ':wave:': '👋',
  ':muscle:': '💪',
  ':party:': '🥳',
  ':crying:': '😢',
  ':angry:': '😠',
  ':cool:': '😎',
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export function EmojiPicker({ onSelect, onClose, buttonRef }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<string>('Smileys & Emotion');
  const [searchTerm, setSearchTerm] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, buttonRef]);

  const filteredEmojis = searchTerm
    ? Object.values(EMOJI_DATA)
        .flatMap((cat) => cat.emojis)
        .filter((emoji) => {
          const shortcut = Object.entries(EMOJI_SHORTCUTS).find(([_, e]) => e === emoji)?.[0];
          return shortcut?.includes(searchTerm.toLowerCase());
        })
    : EMOJI_DATA[activeTab]?.emojis || [];

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
    >
      {/* Tabs at top */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {Object.entries(EMOJI_DATA).map(([category, data]) => (
          <button
            key={category}
            onClick={() => {
              setActiveTab(category);
              setSearchTerm('');
            }}
            className={`flex-1 py-2.5 text-xl transition ${
              activeTab === category
                ? 'bg-white border-b-2 border-blue-500'
                : 'hover:bg-slate-100'
            }`}
            title={category}
          >
            {data.icon}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="p-3 border-b border-slate-200 bg-white">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search emoji..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Emoji grid */}
      <div className="p-3 grid grid-cols-8 gap-1 max-h-64 overflow-y-auto bg-white">
        {filteredEmojis.length === 0 ? (
          <div className="col-span-8 text-center text-sm text-slate-400 py-8">
            No emojis found
          </div>
        ) : (
          filteredEmojis.map((emoji, index) => (
            <button
              key={index}
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
              className="text-2xl hover:bg-slate-100 rounded p-1.5 transition active:scale-95"
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function parseEmojiShortcuts(text: string): string {
  let result = text;
  Object.entries(EMOJI_SHORTCUTS).forEach(([shortcut, emoji]) => {
    result = result.replaceAll(shortcut, emoji);
  });
  return result;
}

export function getEmojiPreview(text: string): { emoji: string; position: number } | null {
  const match = text.match(/(:[a-z_-]+:)$/);
  if (!match) return null;
  
  const shortcut = match[1];
  const emoji = EMOJI_SHORTCUTS[shortcut];
  
  if (emoji) {
    return {
      emoji,
      position: text.length - shortcut.length,
    };
  }
  
  return null;
}