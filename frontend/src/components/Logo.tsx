import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 120 }) => {
  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src="/logo.jpeg"
        alt="Glow State Peptides"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover drop-shadow-[0_0_10px_rgba(168,85,247,0.45)]"
      />
    </div>
  );
};
