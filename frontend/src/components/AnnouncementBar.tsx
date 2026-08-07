import React from 'react';

interface AnnouncementBarProps {
  message?: string;
}

/**
 * Slim announcement strip that sits above the primary nav. The message
 * repeats several times in a single row and scrolls continuously to the
 * left (each row is rendered twice back-to-back and the track is
 * translated left by exactly 50%, so the loop point is invisible).
 */
export function AnnouncementBar({
  message = 'Free express shipping for orders over $160',
}: AnnouncementBarProps) {
  // Repeat the message enough times to comfortably fill one row on wide screens.
  const row = Array.from({ length: 8 }, () => message);
  const track = [...row, ...row];

  return (
    <div className="sticky top-0 z-50 h-8 overflow-hidden bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-600 text-white">
      <div className="announcement-track flex w-max">
        {track.map((msg, i) => (
          <span
            key={i}
            className="h-8 flex items-center whitespace-nowrap px-4 text-[11px] sm:text-xs font-semibold tracking-wide"
          >
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
}
