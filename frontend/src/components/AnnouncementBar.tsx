import React from 'react';

interface AnnouncementBarProps {
  messages?: string[];
}

/**
 * Slim announcement strip that sits above the primary nav. The message list
 * loops in a continuous upward-scrolling marquee (each message is rendered
 * twice back-to-back and the track is translated up by exactly 50%, so the
 * loop point is invisible).
 */
export function AnnouncementBar({
  messages = ['Free express shipping for orders over $160'],
}: AnnouncementBarProps) {
  const track = [...messages, ...messages];

  return (
    <div className="sticky top-0 z-50 h-8 overflow-hidden bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-600 text-white">
      <div className="announcement-track flex flex-col">
        {track.map((msg, i) => (
          <div
            key={i}
            className="h-8 flex items-center justify-center px-4 text-[11px] sm:text-xs font-semibold tracking-wide text-center"
          >
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
}
